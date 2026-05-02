import { createClient } from "./supabase/client";
import { createGuest } from "./rally";

export type BlockStatus = "open" | "cancelled";

export interface OpenPlayBlock {
  id: string;
  court_id: string;
  created_by: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: BlockStatus;
  created_at: string;
  updated_at: string;
}

export interface BlockAttendee {
  player_id: string;
  joined_at: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  is_guest: boolean;
}

export interface BlockWithAttendees extends OpenPlayBlock {
  attendees: BlockAttendee[];
}

/**
 * Pull every open-play block at a court within the next 7 days. Includes
 * already-started blocks for "today" so players can still see + join an
 * in-progress session.
 */
export async function fetchCourtBlocks(courtId: string): Promise<BlockWithAttendees[]> {
  const supabase = createClient();
  const startWindow = startOfTodayUtc();
  const endWindow = new Date(startWindow.getTime() + 8 * 24 * 60 * 60 * 1000);

  const { data: blocks, error } = await supabase
    .from("open_play_blocks")
    .select(
      "id, court_id, created_by, starts_at, ends_at, notes, status, created_at, updated_at",
    )
    .eq("court_id", courtId)
    .gte("starts_at", startWindow.toISOString())
    .lt("starts_at", endWindow.toISOString())
    .order("starts_at", { ascending: true });

  if (error || !blocks) {
    if (error) console.error("fetchCourtBlocks failed:", error);
    return [];
  }

  if (blocks.length === 0) return [];

  // Pull every attendee for these blocks
  const blockIds = blocks.map((b) => b.id);
  const { data: attendeeRows } = await supabase
    .from("open_play_attendees")
    .select(
      `block_id, player_id, joined_at,
       player:players (
         id, display_name, username, avatar_url,
         avatar_focal_x, avatar_focal_y, is_guest
       )`,
    )
    .in("block_id", blockIds)
    .order("joined_at", { ascending: true });

  const attendeesByBlock = new Map<string, BlockAttendee[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);
  for (const row of (attendeeRows ?? []) as Array<{
    block_id: string;
    player_id: string;
    joined_at: string;
    player: unknown;
  }>) {
    const player = j(row.player);
    if (!player) continue;
    if (!attendeesByBlock.has(row.block_id)) {
      attendeesByBlock.set(row.block_id, []);
    }
    attendeesByBlock.get(row.block_id)!.push({
      player_id: row.player_id,
      joined_at: row.joined_at,
      display_name: player.display_name,
      username: player.username,
      avatar_url: player.avatar_url,
      avatar_focal_x: player.avatar_focal_x,
      avatar_focal_y: player.avatar_focal_y,
      is_guest: player.is_guest,
    });
  }

  return blocks.map((b) => ({
    ...b,
    attendees: attendeesByBlock.get(b.id) ?? [],
  })) as BlockWithAttendees[];
}

export async function createBlock(input: {
  courtId: string;
  createdBy: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("open_play_blocks")
    .insert({
      court_id: input.courtId,
      created_by: input.createdBy,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Defense in depth: explicitly add the creator as the first attendee.
  // Migration 0027's trigger should already do this server-side, but if
  // the trigger isn't installed (older databases) we want the creator to
  // appear in the attendee list immediately. Duplicate insert is safely
  // ignored on the client.
  try {
    await supabase
      .from("open_play_attendees")
      .insert({ block_id: data.id, player_id: input.createdBy });
  } catch {
    /* trigger already inserted — ignore duplicate-key error */
  }

  return data;
}

export async function joinBlock(blockId: string, playerId: string) {
  const supabase = createClient();
  // Upsert with ignoreDuplicates so re-clicking Join (or joining a block
  // you already joined elsewhere) doesn't 409 — the row simply stays.
  const { error } = await supabase
    .from("open_play_attendees")
    .upsert(
      { block_id: blockId, player_id: playerId },
      { onConflict: "block_id,player_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

/**
 * Add an existing player to a block as the inviter. Used when the inviter
 * picks a known member from the typeahead.
 */
export async function inviteExistingPlayer(
  blockId: string,
  invitedPlayerId: string,
  invitedByPlayerId: string,
) {
  const supabase = createClient();
  const { error } = await supabase.from("open_play_attendees").insert({
    block_id: blockId,
    player_id: invitedPlayerId,
    invited_by: invitedByPlayerId,
  });
  if (error && !/duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }
}

/**
 * Invite a non-member by email or phone. Creates a guest player row
 * (with an invite_token if phone is provided so the inviter can text a
 * /c/<token> claim link), adds them as a block attendee, and returns
 * data needed for follow-up email/SMS.
 */
export async function inviteNonMember(input: {
  blockId: string;
  invitedByPlayerId: string;
  displayName: string;
  email?: string;
  phone?: string;
}): Promise<{
  playerId: string;
  email: string | null;
  phone: string | null;
  claimUrl: string | null;
}> {
  const guest = await createGuest(
    input.displayName,
    input.email,
    input.phone,
  );

  const supabase = createClient();
  const { error } = await supabase.from("open_play_attendees").insert({
    block_id: input.blockId,
    player_id: guest.id,
    invited_by: input.invitedByPlayerId,
  });
  if (error && !/duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }

  const siteUrl =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://pklrally.com";
  const claimUrl = guest.invite_token
    ? `${siteUrl}/c/${guest.invite_token}`
    : null;

  return {
    playerId: guest.id,
    email: guest.email ?? input.email ?? null,
    phone: guest.phone ?? input.phone ?? null,
    claimUrl,
  };
}

export async function leaveBlock(blockId: string, playerId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("open_play_attendees")
    .delete()
    .eq("block_id", blockId)
    .eq("player_id", playerId);
  if (error) throw new Error(error.message);
}

export async function cancelBlock(blockId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("open_play_blocks")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", blockId);
  if (error) throw new Error(error.message);
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
function startOfTodayUtc(): Date {
  const d = new Date();
  // Roll back 12 hours so all timezones see "today" — fine because we
  // filter to the next 7 days from this anchor and timezone-display in
  // each block card.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Group blocks by their day in the COURT's timezone. Returns an array
 * of { dateLabel, isoDate, blocks } for stable rendering.
 */
export function groupBlocksByDay(
  blocks: BlockWithAttendees[],
  timezone: string,
): Array<{ key: string; label: string; subLabel: string; blocks: BlockWithAttendees[] }> {
  const groups = new Map<string, BlockWithAttendees[]>();
  for (const b of blocks) {
    const dt = new Date(b.starts_at);
    // Date key in the court's timezone, e.g. "2026-05-01"
    const key = dt.toLocaleDateString("en-CA", { timeZone: timezone });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }

  return Array.from(groups.entries()).map(([key, blocks]) => {
    const sample = new Date(blocks[0].starts_at);
    const label = sample.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: timezone,
    });
    const subLabel = sample.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: timezone,
    });
    return { key, label, subLabel, blocks };
  });
}

export function formatBlockTimeRange(
  block: OpenPlayBlock,
  timezone: string,
): string {
  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  const startStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
  const endStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  });
  return `${startStr} – ${endStr}`;
}
