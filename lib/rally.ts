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
  /** Phone (E.164 or local) for click-to-text guest invite */
  phone?: string;
  /** If true, send an email invite (or surface SMS link) after match save */
  sendInvite?: boolean;
}

/** Returned by saveMatch — guests flagged for an email invite. */
export interface PendingInvite {
  playerId: string;
  email: string;
  displayName: string;
}

/**
 * Returned by saveMatch — guests flagged for a click-to-text invite. The
 * UI builds an `sms:` URL from these and shows a "Text X her invite"
 * button that opens the logger's native SMS app with the body pre-filled.
 */
export interface PendingSmsInvite {
  playerId: string;
  phone: string;
  displayName: string;
  /** Full claim URL: https://pklrally.com/c/<token> */
  claimUrl: string;
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
 * Generic names that map to the shared "Guest" placeholder player instead of
 * creating a new row. Anyone typing these is just saying "anonymous fourth"
 * rather than naming a specific person.
 */
const GENERIC_GUEST_NAMES = new Set([
  "guest",
  "anon",
  "anonymous",
  "unknown",
  "tbd",
  "?",
  "n/a",
  "na",
]);

/**
 * Insert a new guest player row. Used when the user types a name that doesn't
 * match an existing player and clicks "Add as guest".
 *
 * Generic placeholder names ("guest", "anon", etc.) with no contact info
 * reuse a single shared "Guest" row (seeded by migration 0014) so we don't
 * create dozens of useless duplicate guests.
 *
 * If a phone is provided, we mint an `invite_token` so the logger can
 * send a click-to-text claim link. The token expires in 90 days.
 */
export async function createGuest(
  displayName: string,
  email?: string,
  phone?: string,
): Promise<{
  id: string;
  display_name: string;
  is_guest: boolean;
  email: string | null;
  phone?: string | null;
  invite_token?: string | null;
}> {
  const supabase = createClient();
  const trimmedName = displayName.trim();
  const normalized = trimmedName.toLowerCase();
  const isPlaceholder =
    !email && !phone && GENERIC_GUEST_NAMES.has(normalized);

  if (isPlaceholder) {
    // Reuse the shared "Guest" player from migration 0014
    const { data: shared } = await supabase
      .from("players")
      .select("id, display_name, is_guest, email")
      .eq("display_name", "Guest")
      .eq("is_guest", true)
      .is("auth_user_id", null)
      .is("email", null)
      .limit(1)
      .maybeSingle();
    if (shared) return shared;
    // If migration hasn't run yet, fall through to creating a normal guest
  }

  // Generate a one-time claim token if we have a phone (so the logger
  // can text a /c/<token> link). Tokens expire in 90 days.
  const inviteToken = phone ? crypto.randomUUID() : null;
  const expiresAt = phone
    ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("players")
    .insert({
      display_name: trimmedName,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      is_guest: true,
      invite_token: inviteToken,
      invite_token_expires_at: expiresAt,
    })
    .select("id, display_name, is_guest, email, phone, invite_token")
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
  pendingSmsInvites: PendingSmsInvite[];
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

  // Capture invite_token per slot for click-to-text invites (set when a
  // guest is created with a phone number).
  const inviteTokensBySlot: (string | null)[] = [null, null, null, null];

  async function ensurePlayerId(
    slot: PlayerSlot,
    slotIndex: number,
  ): Promise<string> {
    if (slot.playerId) return slot.playerId;
    const created = await createGuest(
      slot.displayName,
      slot.email,
      slot.phone,
    );
    if (created.invite_token) {
      inviteTokensBySlot[slotIndex] = created.invite_token;
    }
    return created.id;
  }

  const [p1, p2, p3, p4] = await Promise.all([
    ensurePlayerId(input.serverP1, 0),
    ensurePlayerId(input.serverP2, 1),
    ensurePlayerId(input.receiverP1, 2),
    ensurePlayerId(input.receiverP2, 3),
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

  // Build the list of click-to-text invites (guest + phone + token)
  const siteUrl =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://pklrally.com";

  const pendingSmsInvites: PendingSmsInvite[] = slots
    .map((slot, i) => {
      const token = inviteTokensBySlot[i];
      if (
        slot.kind === "guest" &&
        slot.phone &&
        slot.phone.trim().length >= 10 &&
        token
      ) {
        return {
          playerId: playerIds[i],
          phone: slot.phone.trim(),
          displayName: slot.displayName,
          claimUrl: `${siteUrl}/c/${token}`,
        };
      }
      return null;
    })
    .filter((x): x is PendingSmsInvite => x !== null);

  return { matchId: data.id, status, pendingInvites, pendingSmsInvites };
}
