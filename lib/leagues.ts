/**
 * Ladder leagues — King of the Court format.
 *
 * One league = one event. The creator (admin) sets up the league,
 * adds players, then advances round-by-round until the configured count
 * is hit. Logic lives in TypeScript on the client; RLS in migration 0030
 * enforces that only the creator (or a site admin) can mutate the league.
 *
 * Algorithm summary (verified against the simulation script):
 *   • Byes are SCHEDULED (5 groups of 4 for the 20/4/10 default) — every
 *     player sits the same number of rounds regardless of how they're
 *     playing. No "Court 4 → bench" doom loops.
 *   • Each round, the 16 active players are assigned to 4 courts in
 *     ladder order: top 4 → Court 1, next 4 → Court 2, etc.
 *   • Within each court, the 4 players are split into the 1-of-3 team
 *     pairing that minimizes repeat partnerships (history-aware).
 *   • Movement: winners drift up the ladder, losers drift down. Bye
 *     players hold their previous ladder slot.
 *   • Scoring: winning team = game score + win_bonus; losing team = game
 *     score only. Standings = cumulative total points.
 */

import { createClient } from "./supabase/client";
import { createGuest } from "./rally";

// =====================================================================
// Date formatting
// =====================================================================

/**
 * Default timezone used when a league has no associated court (manual
 * court entry) or the court row has a null timezone. Calvin's home base
 * is Denver and the seed data lives there, so it's a reasonable fallback.
 * Anything that does have a court will use the court's own timezone.
 */
export const DEFAULT_LEAGUE_TZ = "America/Denver";

/**
 * Format a league's scheduled_at timestamp in the COURT's local timezone,
 * so emails and dashboards show "Tuesday, May 18, 6:00 PM MDT" rather
 * than UTC.
 */
export function formatLeagueDateTime(
  iso: string | null | undefined,
  timezone: string | null | undefined,
  opts: { withWeekday?: boolean; withYear?: boolean } = {},
): string {
  if (!iso) return "Date TBA";
  const tz = timezone || DEFAULT_LEAGUE_TZ;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmt: any = {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  };
  if (opts.withWeekday !== false) fmt.weekday = "long";
  if (opts.withYear) fmt.year = "numeric";
  return new Date(iso).toLocaleString("en-US", fmt);
}

/** Short variant (no weekday, no year) — used on compact cards. */
export function formatLeagueDateShort(
  iso: string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return "TBA";
  const tz = timezone || DEFAULT_LEAGUE_TZ;
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

// =====================================================================
// Types
// =====================================================================

export type LeagueStatus = "setup" | "in_progress" | "finished" | "cancelled";
export type LeagueFormat = "kotc" | "mixer";
export type PartnerMode = "shuffled" | "fixed";

export interface League {
  id: string;
  name: string;
  description: string | null;
  scheduled_at: string | null;
  created_by: string;
  court_id: string | null;
  manual_court_name: string | null;
  manual_court_address: string | null;
  n_courts: number;
  n_rounds: number;
  /** Per-session round count. Total rounds = n_rounds * n_sessions. */
  n_sessions: number;
  /** Which session is currently being played (1-indexed). */
  current_session: number;
  /** Scheduled timestamps for each session, length = n_sessions. */
  session_dates: string[] | null;
  win_bonus: number;
  format: LeagueFormat;
  partner_mode: PartnerMode;
  court_rules: string | null;
  status: LeagueStatus;
  /** Round number WITHIN the current session (resets each session). */
  current_round: number;
  player_order: string[];
  created_at: string;
  updated_at: string;
}

export interface LeaguePrize {
  id: string;
  league_id: string;
  place: 1 | 2 | 3;
  description: string | null;
  sponsor_name: string | null;
  sponsor_image_path: string | null;
  /** Public URL for the sponsor image (derived from path). */
  sponsor_image_url: string | null;
}

export type InviteStatus = "pending" | "accepted" | "declined";

export interface LeagueInvite {
  id: string;
  league_id: string;
  email: string;
  phone: string | null;
  invited_by: string;
  status: InviteStatus;
  player_id: string | null;
  invite_token: string;
  created_at: string;
  responded_at: string | null;
}

export interface LeaguePlayer {
  league_id: string;
  player_id: string;
  bye_group: number | null;
  joined_at: string;
  // joined from players table
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  is_guest: boolean;
}

export interface LeagueRound {
  id: string;
  league_id: string;
  round_number: number;
  /** Which session this round belongs to (1-indexed). */
  session_number: number;
  byes: string[];
  status: "in_progress" | "completed";
  created_at: string;
  completed_at: string | null;
}

export interface LeagueMatch {
  id: string;
  league_id: string;
  round_id: string;
  court_number: number;
  team_a_p1: string;
  team_a_p2: string;
  team_b_p1: string;
  team_b_p2: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner: "a" | "b" | null;
  created_at: string;
  scored_at: string | null;
  last_edited_by: string | null;
  last_edited_at: string | null;
}

export interface Standing {
  player_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  total_points: number;
  wins: number;
  losses: number;
  games_played: number;
  byes_count: number;
}

export interface LeagueState {
  league: League;
  players: LeaguePlayer[];
  rounds: LeagueRound[];
  matches: LeagueMatch[];
  standings: Standing[];
  prizes: LeaguePrize[];
}

export type RoundResult = "win" | "loss" | "bye" | "pending";

export interface PerRoundPoint {
  round: number;
  points: number;
  result: RoundResult;
}

export interface PlayerRoundPoints {
  player_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  total_points: number;
  per_round: PerRoundPoint[];
}

// =====================================================================
// CRUD
// =====================================================================

export async function createLeague(input: {
  name: string;
  description?: string | null;
  scheduledAt?: Date | string | null;
  createdBy: string;
  courtId?: string | null;
  manualCourtName?: string | null;
  manualCourtAddress?: string | null;
  nCourts: number;
  nRounds: number;
  nSessions?: number;
  sessionDates?: Array<Date | string> | null;
  winBonus: number;
  courtRules?: string | null;
  format?: LeagueFormat;
  partnerMode?: PartnerMode;
}): Promise<{ id: string }> {
  const supabase = createClient();
  const scheduled = input.scheduledAt
    ? typeof input.scheduledAt === "string"
      ? input.scheduledAt
      : input.scheduledAt.toISOString()
    : null;
  const sessionDatesIso = input.sessionDates
    ? input.sessionDates.map((d) =>
        typeof d === "string" ? d : d.toISOString(),
      )
    : null;
  const { data, error } = await supabase
    .from("leagues")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      scheduled_at: scheduled,
      created_by: input.createdBy,
      court_id: input.courtId ?? null,
      manual_court_name: input.manualCourtName?.trim() || null,
      manual_court_address: input.manualCourtAddress?.trim() || null,
      n_courts: input.nCourts,
      n_rounds: input.nRounds,
      n_sessions: input.nSessions ?? 1,
      session_dates: sessionDatesIso,
      win_bonus: input.winBonus,
      court_rules: input.courtRules?.trim() || null,
      format: input.format ?? "kotc",
      partner_mode: input.partnerMode ?? "shuffled",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Update a league's settings while it's still in 'setup'. After the league
 * has started, most fields shouldn't change — but RLS still allows the
 * creator to update, so it's the UI's job to gate this.
 */
export async function updateLeague(input: {
  id: string;
  name?: string;
  description?: string | null;
  scheduledAt?: Date | string | null;
  courtId?: string | null;
  manualCourtName?: string | null;
  manualCourtAddress?: string | null;
  nCourts?: number;
  nRounds?: number;
  nSessions?: number;
  sessionDates?: Array<Date | string> | null;
  winBonus?: number;
  courtRules?: string | null;
  format?: LeagueFormat;
  partnerMode?: PartnerMode;
}): Promise<void> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined)
    patch.description = input.description?.trim() || null;
  if (input.scheduledAt !== undefined) {
    patch.scheduled_at = input.scheduledAt
      ? typeof input.scheduledAt === "string"
        ? input.scheduledAt
        : input.scheduledAt.toISOString()
      : null;
  }
  if (input.courtId !== undefined) patch.court_id = input.courtId;
  if (input.manualCourtName !== undefined)
    patch.manual_court_name = input.manualCourtName?.trim() || null;
  if (input.manualCourtAddress !== undefined)
    patch.manual_court_address = input.manualCourtAddress?.trim() || null;
  if (input.nCourts !== undefined) patch.n_courts = input.nCourts;
  if (input.nRounds !== undefined) patch.n_rounds = input.nRounds;
  if (input.nSessions !== undefined) patch.n_sessions = input.nSessions;
  if (input.sessionDates !== undefined) {
    patch.session_dates = input.sessionDates
      ? input.sessionDates.map((d) =>
          typeof d === "string" ? d : d.toISOString(),
        )
      : null;
  }
  if (input.winBonus !== undefined) patch.win_bonus = input.winBonus;
  if (input.courtRules !== undefined)
    patch.court_rules = input.courtRules?.trim() || null;
  if (input.format !== undefined) patch.format = input.format;
  if (input.partnerMode !== undefined) patch.partner_mode = input.partnerMode;

  const { error } = await supabase
    .from("leagues")
    .update(patch)
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/** Upload a sponsor image to the league-prizes bucket and return its public URL + path. */
export async function uploadPrizeImage(
  leagueId: string,
  place: 1 | 2 | 3,
  file: File,
): Promise<{ path: string; publicUrl: string }> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${leagueId}/place-${place}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("league-prizes")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("league-prizes").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/** Insert or update a single prize row. */
export async function savePrize(input: {
  leagueId: string;
  place: 1 | 2 | 3;
  description?: string | null;
  sponsorName?: string | null;
  sponsorImagePath?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("league_prizes")
    .upsert(
      {
        league_id: input.leagueId,
        place: input.place,
        description: input.description?.trim() || null,
        sponsor_name: input.sponsorName?.trim() || null,
        sponsor_image_path: input.sponsorImagePath ?? null,
      },
      { onConflict: "league_id,place" },
    );
  if (error) throw new Error(error.message);
}

export async function deletePrize(leagueId: string, place: 1 | 2 | 3): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("league_prizes")
    .delete()
    .eq("league_id", leagueId)
    .eq("place", place);
  if (error) throw new Error(error.message);
}

/** Fetch prizes for a league with public URLs resolved. */
export async function fetchPrizes(leagueId: string): Promise<LeaguePrize[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("league_prizes")
    .select("*")
    .eq("league_id", leagueId)
    .order("place", { ascending: true });
  if (error || !data) return [];
  return data.map((p) => {
    let publicUrl: string | null = null;
    if (p.sponsor_image_path) {
      const { data: urlData } = supabase.storage
        .from("league-prizes")
        .getPublicUrl(p.sponsor_image_path);
      publicUrl = urlData.publicUrl;
    }
    return { ...p, sponsor_image_url: publicUrl } as LeaguePrize;
  });
}

// =====================================================================
// Invites
// =====================================================================

/** Create a pending invite for the given email. */
export async function createInvite(input: {
  leagueId: string;
  email: string;
  phone?: string;
  invitedBy: string;
  /** Optional: link this invite to an already-existing player. When set,
   *  the RSVP flow re-uses this player_id instead of creating a guest. */
  playerId?: string;
}): Promise<{ id: string; token: string }> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    league_id: input.leagueId,
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    invited_by: input.invitedBy,
  };
  if (input.playerId) row.player_id = input.playerId;
  const { data, error } = await supabase
    .from("league_invites")
    .upsert(row, { onConflict: "league_id,email", ignoreDuplicates: false })
    .select("id, invite_token")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, token: data.invite_token };
}

/**
 * Add a player to a league, routing through the email invite flow when
 * a valid email is available so the recipient can accept or decline
 * before they end up on the roster. Falls back to a direct add when
 * no email is available (phone-only or no-contact guests).
 *
 * Used by the AddPlayerForm on the league dashboard for both the
 * typeahead "add existing member" and the "add new guest" paths.
 */
export async function addOrInvitePlayer(input: {
  leagueId: string;
  invitedBy: string;
  /** Existing player path. */
  playerId?: string;
  /** New-guest path. */
  displayName?: string;
  email?: string;
  phone?: string;
}): Promise<{
  playerId: string;
  /** Address an invite email was sent to, or null if no email path. */
  emailedTo: string | null;
  /** SMS claim URL for phone-only guests, or null otherwise. */
  claimUrl: string | null;
}> {
  const supabase = createClient();

  let playerId = input.playerId;
  let email = input.email?.trim().toLowerCase();
  let phone = input.phone?.trim();
  let inviteToken: string | null = null;

  if (!playerId) {
    // New-guest path: create the player row first.
    if (!input.displayName?.trim()) {
      throw new Error("Display name required for new player");
    }
    const guest = await createGuest(
      input.displayName,
      email,
      phone,
    );
    playerId = guest.id;
    email = guest.email?.toLowerCase() ?? email;
    phone = guest.phone ?? phone;
    inviteToken = guest.invite_token ?? null;
  } else if (!email) {
    // Existing player path with no email passed in — look it up.
    const { data } = await supabase
      .from("players")
      .select("email")
      .eq("id", playerId)
      .maybeSingle();
    email = data?.email?.toLowerCase() ?? undefined;
  }

  const validEmail =
    !!email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !email.includes("__seed__");

  if (validEmail) {
    // Email path — create invite + fire the RSVP email. Player is NOT
    // added to league_players yet; they need to accept first.
    const inv = await createInvite({
      leagueId: input.leagueId,
      email: email as string,
      phone,
      invitedBy: input.invitedBy,
      playerId,
    });
    try {
      await sendInviteEmail({ leagueId: input.leagueId, inviteId: inv.id });
    } catch (e) {
      // Don't throw — the invite row exists; admin can resend from the
      // Invites panel.
      console.error("addOrInvitePlayer: invite email failed:", e);
    }
    return { playerId, emailedTo: email as string, claimUrl: null };
  }

  // No-email path — direct add to the roster.
  const { error } = await supabase
    .from("league_players")
    .upsert(
      { league_id: input.leagueId, player_id: playerId },
      { onConflict: "league_id,player_id", ignoreDuplicates: true },
    );
  if (error && !/duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }

  const siteUrl =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://pklrally.com";
  const claimUrl = inviteToken ? `${siteUrl}/c/${inviteToken}` : null;
  return { playerId, emailedTo: null, claimUrl };
}

export async function fetchInvites(leagueId: string): Promise<LeagueInvite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("league_invites")
    .select("*")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchInvites failed:", error);
    return [];
  }
  return (data ?? []) as LeagueInvite[];
}

/**
 * Remove an invitee from a league — drops both the invite row and (if the
 * invite was tied to a real player) the corresponding league_players row,
 * so they disappear from the roster entirely.
 *
 * Historical matches are NOT touched: league_matches.team_*_p* references
 * players(id) directly, so prior rounds still render correctly. The removed
 * player just won't be paired into any future rounds and won't appear in
 * the active roster or invite list.
 *
 * RLS allows the league creator + admins (see migrations 0030, 0031).
 */
export async function removeInvitee(input: {
  leagueId: string;
  inviteId: string;
  /** Optional — if the invite was linked to a real player, that player_id
   *  also needs to be pulled from league_players. */
  playerId?: string | null;
}): Promise<void> {
  const supabase = createClient();

  // Drop the invite row first
  const { error: invErr } = await supabase
    .from("league_invites")
    .delete()
    .eq("id", input.inviteId);
  if (invErr) throw new Error(invErr.message);

  // If we know which player this invite belonged to, drop them from the
  // roster too. Best-effort: ignore not-found errors.
  if (input.playerId) {
    const { error: lpErr } = await supabase
      .from("league_players")
      .delete()
      .eq("league_id", input.leagueId)
      .eq("player_id", input.playerId);
    if (lpErr && !/no rows/i.test(lpErr.message)) {
      throw new Error(lpErr.message);
    }
  }
}

/** Public RSVP — calls the SECURITY DEFINER RPC, no auth required. */
export async function respondToInvite(input: {
  token: string;
  action: "accept" | "decline";
  displayName?: string;
}): Promise<{ leagueId: string; status: InviteStatus; playerId: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("respond_to_league_invite", {
    p_token: input.token,
    p_action: input.action,
    p_display_name: input.displayName ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    leagueId: row?.league_id ?? "",
    status: (row?.status ?? "pending") as InviteStatus,
    playerId: row?.player_id ?? null,
  };
}

/** Send the invite email via the /api/invite/league route. */
export async function sendInviteEmail(input: {
  leagueId: string;
  inviteId: string;
}): Promise<void> {
  const res = await fetch("/api/invite/league", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed: ${body}`);
  }
}

/**
 * Send the "league complete" email to every player who has an email
 * address on file. Includes their final rank, points, W-L, prize (if
 * top 3), and links to /stats and the league results page.
 *
 * Fired automatically when a league transitions to status='finished'
 * via advanceRound or finalizeLeague. Can also be triggered manually
 * from the admin "Resend results email" button on the finished panel.
 */
export async function sendLeagueCompletionEmails(
  leagueId: string,
): Promise<{ sent: number; failed: number; total: number }> {
  const res = await fetch("/api/invite/league-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leagueId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Completion emails failed: ${body}`);
  }
  return res.json();
}

/**
 * Add a single player to a league. If `playerId` is given, uses the existing
 * member. Otherwise creates a guest with the provided name/email/phone (and
 * returns a claim URL if a phone was supplied so the admin can text it).
 */
export async function addLeaguePlayer(input: {
  leagueId: string;
  playerId?: string;
  displayName?: string;
  email?: string;
  phone?: string;
}): Promise<{ playerId: string; claimUrl: string | null }> {
  const supabase = createClient();

  let playerId = input.playerId;
  let inviteToken: string | null = null;
  if (!playerId) {
    if (!input.displayName?.trim()) {
      throw new Error("Display name required for new player");
    }
    const guest = await createGuest(input.displayName, input.email, input.phone);
    playerId = guest.id;
    inviteToken = guest.invite_token ?? null;
  }

  const { error } = await supabase
    .from("league_players")
    .upsert(
      { league_id: input.leagueId, player_id: playerId },
      { onConflict: "league_id,player_id", ignoreDuplicates: true },
    );
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);

  const siteUrl =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://pklrally.com";
  return {
    playerId,
    claimUrl: inviteToken ? `${siteUrl}/c/${inviteToken}` : null,
  };
}

export async function removeLeaguePlayer(leagueId: string, playerId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("league_players")
    .delete()
    .eq("league_id", leagueId)
    .eq("player_id", playerId);
  if (error) throw new Error(error.message);
}

export async function fetchLeague(leagueId: string): Promise<League | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", leagueId)
    .maybeSingle();
  if (error) {
    console.error("fetchLeague failed:", error);
    return null;
  }
  return (data ?? null) as League | null;
}

export async function fetchLeagueState(leagueId: string): Promise<LeagueState | null> {
  const supabase = createClient();
  const league = await fetchLeague(leagueId);
  if (!league) return null;

  // players + join to players table
  const { data: lpRaw } = await supabase
    .from("league_players")
    .select("league_id, player_id, bye_group, joined_at")
    .eq("league_id", leagueId)
    .order("joined_at", { ascending: true });

  const playerIds = (lpRaw ?? []).map((r) => r.player_id);
  const { data: playerRows } = playerIds.length
    ? await supabase
        .from("players")
        .select(
          "id, display_name, username, avatar_url, avatar_focal_x, avatar_focal_y, is_guest",
        )
        .in("id", playerIds)
    : { data: [] as Array<{
        id: string;
        display_name: string;
        username: string | null;
        avatar_url: string | null;
        avatar_focal_x: number | null;
        avatar_focal_y: number | null;
        is_guest: boolean;
      }> };
  const playersById = new Map((playerRows ?? []).map((p) => [p.id, p] as const));

  const players: LeaguePlayer[] = (lpRaw ?? []).map((r) => {
    const p = playersById.get(r.player_id);
    return {
      league_id: r.league_id,
      player_id: r.player_id,
      bye_group: r.bye_group,
      joined_at: r.joined_at,
      display_name: p?.display_name ?? "Player",
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      avatar_focal_x: p?.avatar_focal_x ?? null,
      avatar_focal_y: p?.avatar_focal_y ?? null,
      is_guest: p?.is_guest ?? false,
    };
  });

  // rounds + matches
  const { data: roundsRaw } = await supabase
    .from("league_rounds")
    .select("*")
    .eq("league_id", leagueId)
    .order("round_number", { ascending: true });

  const { data: matchesRaw } = await supabase
    .from("league_matches")
    .select("*")
    .eq("league_id", leagueId)
    .order("court_number", { ascending: true });

  const rounds = (roundsRaw ?? []) as LeagueRound[];
  const matches = (matchesRaw ?? []) as LeagueMatch[];

  const standings = computeStandings(league, players, matches);
  const prizes = await fetchPrizes(leagueId);

  return { league, players, rounds, matches, standings, prizes };
}

// =====================================================================
// Bye scheduling
// =====================================================================

/**
 * Split players into bye groups. Returns map player_id → bye_group (1..N).
 * Group g sits the rounds where ((r-1) mod n_groups) == (g-1).
 * For 20 players / 4 byes per round → 5 groups → each plays r rounds
 * and sits ceil(n_rounds/n_groups) or floor(n_rounds/n_groups) rounds.
 * For the 20/4/10 default it's perfectly even: 2 byes each.
 */
export function assignByeGroups(
  playerIds: string[],
  byesPerRound: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (byesPerRound <= 0) return result;

  // Shuffle players for fairness
  const shuffled = [...playerIds];
  shuffleInPlace(shuffled);

  const nGroups = Math.ceil(shuffled.length / byesPerRound);
  for (let i = 0; i < shuffled.length; i++) {
    const group = Math.floor(i / byesPerRound) + 1; // 1..nGroups
    result.set(shuffled[i], Math.min(group, nGroups));
  }
  return result;
}

/** Which players sit during round R (1-indexed)? Based on bye_group cycling. */
export function byesForRound(
  players: LeaguePlayer[],
  roundNumber: number,
): string[] {
  const groups = players
    .map((p) => p.bye_group)
    .filter((g): g is number => g !== null && g > 0);
  if (groups.length === 0) return [];
  const nGroups = Math.max(...groups);
  const currentGroup = ((roundNumber - 1) % nGroups) + 1;
  return players
    .filter((p) => p.bye_group === currentGroup)
    .map((p) => p.player_id);
}

// =====================================================================
// Partner pairing
// =====================================================================

type PartnerHistory = Map<string, number>; // key: "uuid_a|uuid_b" (sorted)

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildPartnerHistory(matches: LeagueMatch[]): PartnerHistory {
  const h = new Map<string, number>();
  for (const m of matches) {
    const k1 = pairKey(m.team_a_p1, m.team_a_p2);
    const k2 = pairKey(m.team_b_p1, m.team_b_p2);
    h.set(k1, (h.get(k1) ?? 0) + 1);
    h.set(k2, (h.get(k2) ?? 0) + 1);
  }
  return h;
}

/**
 * Pick the 1-of-3 team split for 4 players that minimizes repeat partnerships.
 * Tiebreaker: random. Returns [teamA, teamB] each of [p1, p2].
 */
export function bestPairing(
  four: string[],
  history: PartnerHistory,
): [[string, string], [string, string]] {
  if (four.length !== 4) {
    throw new Error(`bestPairing expected 4 players, got ${four.length}`);
  }
  const [a, b, c, d] = four;
  const options: Array<[[string, string], [string, string]]> = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  shuffleInPlace(options); // random tiebreak

  let best = options[0];
  let bestCost = costOf(best, history);
  for (let i = 1; i < options.length; i++) {
    const c2 = costOf(options[i], history);
    if (c2 < bestCost) {
      best = options[i];
      bestCost = c2;
    }
  }
  return best;
}

function costOf(
  opt: [[string, string], [string, string]],
  history: PartnerHistory,
): number {
  const [t1, t2] = opt;
  return (history.get(pairKey(t1[0], t1[1])) ?? 0)
       + (history.get(pairKey(t2[0], t2[1])) ?? 0);
}

// =====================================================================
// Round generation
// =====================================================================

/**
 * Generate Round 1 for a league. Validates state, assigns bye groups,
 * randomly seeds the ladder, and creates the round + match rows.
 */
export async function generateRound1(leagueId: string): Promise<void> {
  const supabase = createClient();
  const state = await fetchLeagueState(leagueId);
  if (!state) throw new Error("League not found");
  const { league, players } = state;
  if (league.status !== "setup") {
    throw new Error(`League is not in setup state (status=${league.status})`);
  }

  const minPlayers = league.n_courts * 4;
  if (players.length < minPlayers) {
    throw new Error(`Need at least ${minPlayers} players (have ${players.length})`);
  }

  const byesPerRound = players.length - league.n_courts * 4;

  // 1. Assign bye groups (persist on league_players rows)
  const byeMap = assignByeGroups(players.map((p) => p.player_id), byesPerRound);
  if (byesPerRound > 0) {
    // Bulk upsert: one round-trip per player is fine for ≤30 players
    for (const p of players) {
      const grp = byeMap.get(p.player_id) ?? null;
      const { error } = await supabase
        .from("league_players")
        .update({ bye_group: grp })
        .eq("league_id", leagueId)
        .eq("player_id", p.player_id);
      if (error) throw new Error(`bye assignment failed: ${error.message}`);
    }
  }

  // 2. Seed initial ladder: random shuffle of all players
  const ladder = players.map((p) => p.player_id);
  shuffleInPlace(ladder);

  // 3. Determine Round 1 byes (group 1 sits round 1)
  const round1Byes: string[] = [];
  if (byesPerRound > 0) {
    for (const [pid, g] of byeMap.entries()) {
      if (g === 1) round1Byes.push(pid);
    }
  }
  const byeSet = new Set(round1Byes);
  const active = ladder.filter((p) => !byeSet.has(p));

  // 4. Assign to courts, pair, create matches
  const history = new Map<string, number>(); // empty for round 1
  const matchRows = buildMatchRows(leagueId, active, league.n_courts, history);

  // 5. Insert round + matches; update league
  const { data: roundRow, error: roundErr } = await supabase
    .from("league_rounds")
    .insert({
      league_id: leagueId,
      round_number: 1,
      session_number: 1,
      byes: round1Byes,
      status: "in_progress",
    })
    .select("id")
    .single();
  if (roundErr) throw new Error(`round insert failed: ${roundErr.message}`);

  const matchesWithRound = matchRows.map((m) => ({ ...m, round_id: roundRow.id }));
  const { error: matchErr } = await supabase
    .from("league_matches")
    .insert(matchesWithRound);
  if (matchErr) {
    // best-effort rollback
    await supabase.from("league_rounds").delete().eq("id", roundRow.id);
    throw new Error(`match insert failed: ${matchErr.message}`);
  }

  const { error: lgErr } = await supabase
    .from("leagues")
    .update({
      status: "in_progress",
      current_round: 1,
      current_session: 1,
      player_order: ladder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);
  if (lgErr) throw new Error(`league update failed: ${lgErr.message}`);
}

/**
 * Save the score for one court's match. Sets winner column based on scores.
 * If the match already had scores (i.e. this is an edit, not a first save)
 * an audit row is written to league_match_edits with the old + new values
 * and the last_edited_by / last_edited_at stamps are updated.
 */
export async function saveMatchScore(
  matchId: string,
  scoreA: number,
  scoreB: number,
): Promise<void> {
  if (scoreA === scoreB) {
    throw new Error("Pickleball games can't end in a tie — re-check the score");
  }
  if (scoreA < 0 || scoreB < 0) {
    throw new Error("Scores must be non-negative");
  }
  const supabase = createClient();

  // Resolve the current player (for audit stamping). Best-effort —
  // failing to find a player isn't fatal; we just skip the audit row.
  let editorPlayerId: string | null = null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (auth?.user) {
      const { data: row } = await supabase
        .from("players")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      editorPlayerId = row?.id ?? null;
    }
  } catch {
    // ignore — we'll save the score without an editor stamp
  }

  // Read current match to compare and to grab league_id for the audit row
  const { data: existing } = await supabase
    .from("league_matches")
    .select("league_id, team_a_score, team_b_score")
    .eq("id", matchId)
    .maybeSingle();

  const isEdit =
    existing &&
    existing.team_a_score !== null &&
    existing.team_b_score !== null &&
    (existing.team_a_score !== scoreA || existing.team_b_score !== scoreB);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    team_a_score: scoreA,
    team_b_score: scoreB,
    winner: scoreA > scoreB ? "a" : "b",
    scored_at: new Date().toISOString(),
  };
  if (isEdit) {
    patch.last_edited_by = editorPlayerId;
    patch.last_edited_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("league_matches")
    .update(patch)
    .eq("id", matchId);
  if (error) throw new Error(error.message);

  // Audit log — best-effort, don't fail the save if the log insert errors
  if (isEdit && existing?.league_id) {
    await supabase
      .from("league_match_edits")
      .insert({
        match_id: matchId,
        league_id: existing.league_id,
        edited_by: editorPlayerId,
        old_team_a_score: existing.team_a_score,
        old_team_b_score: existing.team_b_score,
        new_team_a_score: scoreA,
        new_team_b_score: scoreB,
      })
      .then(({ error: e }) => {
        if (e) console.warn("edit-log insert failed:", e.message);
      });
  }
}

export interface MatchEdit {
  id: string;
  match_id: string;
  edited_by: string | null;
  old_team_a_score: number | null;
  old_team_b_score: number | null;
  new_team_a_score: number | null;
  new_team_b_score: number | null;
  edited_at: string;
}

/** Fetch the audit log of edits for a given match (most recent first). */
export async function fetchMatchEdits(matchId: string): Promise<MatchEdit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("league_match_edits")
    .select("*")
    .eq("match_id", matchId)
    .order("edited_at", { ascending: false });
  if (error) {
    console.error("fetchMatchEdits failed:", error);
    return [];
  }
  return (data ?? []) as MatchEdit[];
}

/**
 * Advance the league to the next round. Computes movement based on the
 * just-completed round, schedules the next bye group, picks fresh
 * partner pairings, and inserts the new round + matches.
 *
 * If the just-completed round was the last one, marks the league finished.
 */
export async function advanceRound(leagueId: string): Promise<void> {
  const supabase = createClient();
  const state = await fetchLeagueState(leagueId);
  if (!state) throw new Error("League not found");
  const { league, players, rounds, matches } = state;
  if (league.status !== "in_progress") {
    throw new Error(`League not in progress (status=${league.status})`);
  }

  const currentRound = rounds.find(
    (r) =>
      r.session_number === league.current_session &&
      r.round_number === league.current_round,
  );
  if (!currentRound) throw new Error("Current round not found");

  const currentMatches = matches.filter((m) => m.round_id === currentRound.id);
  if (currentMatches.some((m) => m.team_a_score === null || m.team_b_score === null)) {
    throw new Error("All courts must have scores before advancing");
  }

  // Mark current round completed
  await supabase
    .from("league_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", currentRound.id);

  // Decide what comes next: another round in this session, the start of
  // a new session, or the league is finished.
  const atSessionEnd = league.current_round >= league.n_rounds;
  const atFinalSession = league.current_session >= league.n_sessions;

  if (atSessionEnd && atFinalSession) {
    await supabase
      .from("leagues")
      .update({
        status: "finished",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leagueId);
    // Fire-and-forget the completion emails so a transient email
    // failure doesn't block the UI advancing to "finished".
    sendLeagueCompletionEmails(leagueId).catch((e) =>
      console.error("completion emails failed:", e),
    );
    return;
  }

  // ---- Compute next round ----
  const nextSessionNumber = atSessionEnd
    ? league.current_session + 1
    : league.current_session;
  const nextRoundNumber = atSessionEnd ? 1 : league.current_round + 1;
  const byesPerRound = players.length - league.n_courts * 4;

  // Tier values from current round results
  const tier = new Map<string, number>();
  for (const m of currentMatches) {
    const aWon = m.winner === "a";
    const winners = aWon ? [m.team_a_p1, m.team_a_p2] : [m.team_b_p1, m.team_b_p2];
    const losers = aWon ? [m.team_b_p1, m.team_b_p2] : [m.team_a_p1, m.team_a_p2];
    for (const p of winners) tier.set(p, m.court_number - 0.6);
    for (const p of losers) tier.set(p, m.court_number + 0.6);
  }

  // Re-sort active players (those who played this round) by tier
  const activeThisRound = Array.from(tier.keys());
  activeThisRound.sort((a, b) => (tier.get(a)! - tier.get(b)!));

  // Build new ladder. Active players spread across 0..(N-1) range
  // proportional to their new order. Bye players hold their previous slot.
  const oldLadder = league.player_order ?? [];
  const oldIndexOf = new Map(oldLadder.map((p, i) => [p, i] as const));
  const rankScore = new Map<string, number>();
  const denom = Math.max(1, activeThisRound.length - 1);
  activeThisRound.forEach((p, i) => {
    rankScore.set(p, (i * (players.length - 1)) / denom);
  });
  for (const p of currentRound.byes) {
    rankScore.set(p, oldIndexOf.get(p) ?? 0);
  }
  // Any stragglers (shouldn't happen) — append at end
  for (const p of players) {
    if (!rankScore.has(p.player_id)) rankScore.set(p.player_id, players.length);
  }

  const newLadder = players
    .map((p) => p.player_id)
    .sort((a, b) => (rankScore.get(a)! - rankScore.get(b)!));

  // Next round byes (next bye group cycling)
  const nextByes = byesForRound(players, nextRoundNumber);
  const nextByeSet = new Set(nextByes);
  const nextActive = newLadder.filter((p) => !nextByeSet.has(p));

  // Build court matchups with partner-history awareness
  const history = buildPartnerHistory(matches);
  const matchRows = buildMatchRows(leagueId, nextActive, league.n_courts, history);

  // Insert next round + matches
  const { data: roundRow, error: roundErr } = await supabase
    .from("league_rounds")
    .insert({
      league_id: leagueId,
      round_number: nextRoundNumber,
      session_number: nextSessionNumber,
      byes: nextByes,
      status: "in_progress",
    })
    .select("id")
    .single();
  if (roundErr) throw new Error(`round insert failed: ${roundErr.message}`);

  const matchesWithRound = matchRows.map((m) => ({ ...m, round_id: roundRow.id }));
  const { error: matchErr } = await supabase
    .from("league_matches")
    .insert(matchesWithRound);
  if (matchErr) {
    await supabase.from("league_rounds").delete().eq("id", roundRow.id);
    throw new Error(`match insert failed: ${matchErr.message}`);
  }

  await supabase
    .from("leagues")
    .update({
      current_round: nextRoundNumber,
      current_session: nextSessionNumber,
      player_order: newLadder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);
}

/** End the league now (manual override before all rounds complete). */
export async function finalizeLeague(leagueId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("leagues")
    .update({
      status: "finished",
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);
  if (error) throw new Error(error.message);
  // Same fire-and-forget completion emails as advanceRound's natural end.
  sendLeagueCompletionEmails(leagueId).catch((e) =>
    console.error("completion emails failed:", e),
  );
}

export async function deleteLeague(leagueId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("leagues").delete().eq("id", leagueId);
  if (error) throw new Error(error.message);
}

// =====================================================================
// Standings
// =====================================================================

export function computeStandings(
  league: League,
  players: LeaguePlayer[],
  matches: LeagueMatch[],
): Standing[] {
  const bonus = league.win_bonus;
  const stat = new Map<string, Standing>();
  for (const p of players) {
    stat.set(p.player_id, {
      player_id: p.player_id,
      display_name: p.display_name,
      username: p.username,
      avatar_url: p.avatar_url,
      avatar_focal_x: p.avatar_focal_x,
      avatar_focal_y: p.avatar_focal_y,
      total_points: 0,
      wins: 0,
      losses: 0,
      games_played: 0,
      byes_count: 0,
    });
  }

  for (const m of matches) {
    if (m.team_a_score === null || m.team_b_score === null) continue;
    const aWon = m.winner === "a";
    const winners = aWon ? [m.team_a_p1, m.team_a_p2] : [m.team_b_p1, m.team_b_p2];
    const losers = aWon ? [m.team_b_p1, m.team_b_p2] : [m.team_a_p1, m.team_a_p2];
    const winScore = aWon ? m.team_a_score : m.team_b_score;
    const loseScore = aWon ? m.team_b_score : m.team_a_score;

    for (const pid of winners) {
      const s = stat.get(pid);
      if (!s) continue;
      s.total_points += winScore + bonus;
      s.wins += 1;
      s.games_played += 1;
    }
    for (const pid of losers) {
      const s = stat.get(pid);
      if (!s) continue;
      s.total_points += loseScore;
      s.losses += 1;
      s.games_played += 1;
    }
  }

  // Standings sorted by points desc, then wins desc as tiebreak
  const out = Array.from(stat.values());
  out.sort((a, b) => b.total_points - a.total_points || b.wins - a.wins);
  return out;
}

/**
 * For each player, build a per-round score timeline. Used by the stats
 * graph page. Byes contribute 0 points with result="bye"; rounds that
 * haven't been played yet get result="pending".
 */
export function computePlayerRoundPoints(
  league: League,
  players: LeaguePlayer[],
  rounds: LeagueRound[],
  matches: LeagueMatch[],
): PlayerRoundPoints[] {
  const bonus = league.win_bonus;
  // Quick lookups: round_id -> round_number, and a per-player per-round result
  const roundNumberById = new Map(rounds.map((r) => [r.id, r.round_number]));
  const byeSetByRound = new Map(
    rounds.map((r) => [r.round_number, new Set(r.byes)] as const),
  );

  const out: PlayerRoundPoints[] = players.map((p) => ({
    player_id: p.player_id,
    display_name: p.display_name,
    username: p.username,
    avatar_url: p.avatar_url,
    avatar_focal_x: p.avatar_focal_x,
    avatar_focal_y: p.avatar_focal_y,
    total_points: 0,
    per_round: Array.from({ length: league.n_rounds }, (_, i) => ({
      round: i + 1,
      points: 0,
      result: "pending" as RoundResult,
    })),
  }));
  const byId = new Map(out.map((p) => [p.player_id, p] as const));

  // Mark byes first
  for (const [roundNum, byeSet] of byeSetByRound.entries()) {
    for (const pid of byeSet) {
      const p = byId.get(pid);
      if (!p) continue;
      const slot = p.per_round[roundNum - 1];
      if (slot) slot.result = "bye";
    }
  }

  // Apply scored matches
  for (const m of matches) {
    if (m.team_a_score === null || m.team_b_score === null) continue;
    const rNum = roundNumberById.get(m.round_id);
    if (!rNum) continue;
    const aWon = m.winner === "a";
    const winners = aWon ? [m.team_a_p1, m.team_a_p2] : [m.team_b_p1, m.team_b_p2];
    const losers = aWon ? [m.team_b_p1, m.team_b_p2] : [m.team_a_p1, m.team_a_p2];
    const winScore = aWon ? m.team_a_score : m.team_b_score;
    const loseScore = aWon ? m.team_b_score : m.team_a_score;

    for (const pid of winners) {
      const p = byId.get(pid);
      if (!p) continue;
      const pts = winScore + bonus;
      p.per_round[rNum - 1] = { round: rNum, points: pts, result: "win" };
      p.total_points += pts;
    }
    for (const pid of losers) {
      const p = byId.get(pid);
      if (!p) continue;
      p.per_round[rNum - 1] = { round: rNum, points: loseScore, result: "loss" };
      p.total_points += loseScore;
    }
  }

  out.sort((a, b) => b.total_points - a.total_points);
  return out;
}

// =====================================================================
// Helpers
// =====================================================================

/**
 * Given a list of active players in ladder order, build court assignments
 * + partner-aware match rows for one round.
 */
function buildMatchRows(
  leagueId: string,
  active: string[],
  nCourts: number,
  history: PartnerHistory,
) {
  const rows: Array<{
    league_id: string;
    court_number: number;
    team_a_p1: string;
    team_a_p2: string;
    team_b_p1: string;
    team_b_p2: string;
  }> = [];
  for (let c = 1; c <= nCourts; c++) {
    const four = active.slice((c - 1) * 4, c * 4);
    if (four.length !== 4) {
      throw new Error(`Court ${c} has ${four.length} players, expected 4`);
    }
    const [teamA, teamB] = bestPairing(four, history);
    // Update the in-memory history so subsequent courts in the same round
    // also avoid the partnerships we just created.
    history.set(pairKey(teamA[0], teamA[1]), (history.get(pairKey(teamA[0], teamA[1])) ?? 0) + 1);
    history.set(pairKey(teamB[0], teamB[1]), (history.get(pairKey(teamB[0], teamB[1])) ?? 0) + 1);
    rows.push({
      league_id: leagueId,
      court_number: c,
      team_a_p1: teamA[0],
      team_a_p2: teamA[1],
      team_b_p1: teamB[0],
      team_b_p2: teamB[1],
    });
  }
  return rows;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
