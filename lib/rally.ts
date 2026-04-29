import { createClient } from "./supabase/client";

/**
 * A "slot" in the rally form. Either a real player (member or guest already
 * in the DB) or a guest we'll create on save.
 */
export interface PlayerSlot {
  /** "member" = existing players row, "guest" = new guest to be inserted */
  kind: "member" | "guest" | "me";
  /** Existing player_id (for member or already-saved guest) */
  playerId?: string;
  /** Display name shown in UI */
  displayName: string;
  /** Email captured for guest invite */
  email?: string;
  /** If true, send an email invite to this guest after match save */
  sendInvite?: boolean;
}

/** Returned by saveMatch when there are guests flagged for invite. */
export interface PendingInvite {
  playerId: string;
  email: string;
  displayName: string;
}

/**
 * Search active players by display name. Used by the player picker autocomplete.
 * Excludes guests-without-claims by default (you usually want to invite them
 * fresh, not reuse a stale guest row), but we include them so the user can
 * pick a guest they previously logged.
 */
export async function searchPlayers(query: string, limit = 8) {
  const q = query.trim();
  if (!q) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name, is_guest, email")
    .ilike("display_name", `%${q}%`)
    .limit(limit);

  if (error) {
    console.error("searchPlayers failed:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Insert a new guest player row. Used when the user types a name that doesn't
 * match an existing player and clicks "Add as guest".
 */
export async function createGuest(displayName: string, email?: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("players")
    .insert({
      display_name: displayName.trim(),
      email: email?.trim() || null,
      is_guest: true,
    })
    .select("id, display_name, is_guest, email")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fetch all active courts for the picker. Sorted alphabetically.
 * Phase 5 will add geolocation-based "nearest courts" sorting.
 */
export async function fetchCourtsForPicker() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("id, name, city, state")
    .eq("status", "active")
    .order("city", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("fetchCourtsForPicker failed:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Save a completed rally. Returns the inserted match id.
 *
 * Status logic:
 *   - Vouch requires at least 1 registered member on BOTH sides of the court.
 *     The logger is always a member (so their team always qualifies). The
 *     question is whether the OPPOSING team has at least 1 member.
 *   - If yes → 'pending' (awaits a vouch from any opposing-team member)
 *   - If no  → 'unverified_all_guest' (stats accrue, but match is flagged
 *     non-verified until a guest claims their account or admin overrides)
 */
export async function saveMatch(input: {
  courtId: string;
  loggerPlayerId: string;
  serverP1: PlayerSlot; // top-left of serving (active server)
  serverP2: PlayerSlot;
  receiverP1: PlayerSlot;
  receiverP2: PlayerSlot;
  serverScore: number;
  receiverScore: number;
}): Promise<{
  matchId: string;
  status: string;
  pendingInvites: PendingInvite[];
}> {
  const supabase = createClient();

  // Track which slots are flagged for invite, by their position in the input.
  // We resolve player_ids in parallel below; this captures the email + sendInvite
  // bits so we can fire invites after the match row is saved.
  const slots = [
    input.serverP1,
    input.serverP2,
    input.receiverP1,
    input.receiverP2,
  ];

  async function ensurePlayerId(slot: PlayerSlot): Promise<string> {
    if (slot.playerId) return slot.playerId;
    const created = await createGuest(slot.displayName, slot.email);
    return created.id;
  }

  const [p1, p2, p3, p4] = await Promise.all([
    ensurePlayerId(input.serverP1),
    ensurePlayerId(input.serverP2),
    ensurePlayerId(input.receiverP1),
    ensurePlayerId(input.receiverP2),
  ]);
  const playerIds = [p1, p2, p3, p4];

  // Find the logger's team by playerId — robust to "me" slot being cleared
  // and re-picked. Whichever team they're on, the OTHER team is the one
  // that needs to have a member for vouching to be possible.
  const loggerOnServingTeam =
    input.serverP1.playerId === input.loggerPlayerId ||
    input.serverP2.playerId === input.loggerPlayerId;

  const opposingTeam = loggerOnServingTeam
    ? [input.receiverP1, input.receiverP2]
    : [input.serverP1, input.serverP2];

  const opposingTeamHasMember = opposingTeam.some(
    (s) => s.kind === "member" || s.kind === "me",
  );

  const status = opposingTeamHasMember ? "pending" : "unverified_all_guest";

  const { data, error } = await supabase
    .from("matches")
    .insert({
      court_id: input.courtId,
      logged_by: input.loggerPlayerId,
      server_team_p1: p1,
      server_team_p2: p2,
      receiver_team_p1: p3,
      receiver_team_p2: p4,
      server_score: input.serverScore,
      receiver_score: input.receiverScore,
      status,
      played_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Build the list of guests we should email-invite (sendInvite + valid email)
  const pendingInvites: PendingInvite[] = slots
    .map((slot, i) => {
      if (
        slot.kind === "guest" &&
        slot.sendInvite &&
        slot.email &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(slot.email)
      ) {
        return {
          playerId: playerIds[i],
          email: slot.email,
          displayName: slot.displayName,
        };
      }
      return null;
    })
    .filter((x): x is PendingInvite => x !== null);

  return { matchId: data.id, status, pendingInvites };
}
