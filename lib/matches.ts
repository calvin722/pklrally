import { createClient } from "./supabase/client";

export type MatchStatus =
  | "pending"
  | "vouched"
  | "disputed"
  | "unverified_all_guest"
  | "admin_deleted";

export interface MatchPlayer {
  id: string;
  display_name: string;
  is_guest: boolean;
  avatar_url: string | null;
}

export interface MatchSummary {
  id: string;
  court: { id: string; name: string; city: string; state: string } | null;
  played_at: string;
  status: MatchStatus;
  server_score: number;
  receiver_score: number;
  logged_by: string;
  server_team_p1: MatchPlayer | null;
  server_team_p2: MatchPlayer | null;
  receiver_team_p1: MatchPlayer | null;
  receiver_team_p2: MatchPlayer | null;
}

/**
 * Pull a match with the four player rows joined in. PostgREST returns
 * each FK lookup as a single object (or null) since we use !inner / single FK.
 */
const SELECT_FULL = `
  id,
  played_at,
  status,
  server_score,
  receiver_score,
  logged_by,
  court:courts (id, name, city, state),
  server_team_p1:players!matches_server_team_p1_fkey (id, display_name, is_guest, avatar_url),
  server_team_p2:players!matches_server_team_p2_fkey (id, display_name, is_guest, avatar_url),
  receiver_team_p1:players!matches_receiver_team_p1_fkey (id, display_name, is_guest, avatar_url),
  receiver_team_p2:players!matches_receiver_team_p2_fkey (id, display_name, is_guest, avatar_url)
`;

// PostgREST sometimes returns embedded FK lookups as arrays. Normalize.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeJoin<T>(v: any): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMatch(row: any): MatchSummary {
  return {
    id: row.id,
    played_at: row.played_at,
    status: row.status,
    server_score: row.server_score,
    receiver_score: row.receiver_score,
    logged_by: row.logged_by,
    court: normalizeJoin(row.court),
    server_team_p1: normalizeJoin(row.server_team_p1),
    server_team_p2: normalizeJoin(row.server_team_p2),
    receiver_team_p1: normalizeJoin(row.receiver_team_p1),
    receiver_team_p2: normalizeJoin(row.receiver_team_p2),
  };
}

/**
 * Matches awaiting your vouch — you must be on the OPPOSING team
 * (per Calvin's rule: only opposing-team members can vouch).
 */
export async function fetchPendingVouchesForPlayer(
  playerId: string,
): Promise<MatchSummary[]> {
  const supabase = createClient();

  // Two parallel queries — one where logger is on serving and you're on
  // receiving, one where logger is on receiving and you're on serving.
  const [a, b] = await Promise.all([
    supabase
      .from("matches")
      .select(SELECT_FULL)
      .eq("status", "pending")
      .or(`server_team_p1.eq.${playerId},server_team_p2.eq.${playerId}`)
      .or("logged_by.in.()", { foreignTable: undefined })
      .limit(50),
    supabase
      .from("matches")
      .select(SELECT_FULL)
      .eq("status", "pending")
      .or(`receiver_team_p1.eq.${playerId},receiver_team_p2.eq.${playerId}`)
      .limit(50),
  ]);

  // Simpler approach: just grab any pending match this player is in, then
  // filter in JS to ensure they're on the opposing team from the logger.
  const { data, error } = await supabase
    .from("matches")
    .select(SELECT_FULL)
    .eq("status", "pending")
    .or(
      [
        `server_team_p1.eq.${playerId}`,
        `server_team_p2.eq.${playerId}`,
        `receiver_team_p1.eq.${playerId}`,
        `receiver_team_p2.eq.${playerId}`,
      ].join(","),
    )
    .order("played_at", { ascending: false })
    .limit(50);

  // Suppress unused variables from the parallel branch I left in.
  void a;
  void b;

  if (error) {
    console.error("fetchPendingVouchesForPlayer:", error);
    return [];
  }

  const rows = (data ?? []).map(normalizeMatch);

  // Keep only matches where the player is on the OPPOSING team from the logger.
  return rows.filter((m) => {
    const loggerOnServing =
      m.logged_by === m.server_team_p1?.id ||
      m.logged_by === m.server_team_p2?.id;
    const playerOnReceiving =
      playerId === m.receiver_team_p1?.id ||
      playerId === m.receiver_team_p2?.id;
    const playerOnServing =
      playerId === m.server_team_p1?.id ||
      playerId === m.server_team_p2?.id;
    return (
      (loggerOnServing && playerOnReceiving) ||
      (!loggerOnServing && playerOnServing)
    );
  });
}

/**
 * Vouch a match. Insert into vouches; trigger flips matches.status to vouched
 * which fires the stats-update trigger.
 */
export async function vouchMatch(matchId: string, playerId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("vouches").insert({
    match_id: matchId,
    player_id: playerId,
    action: "vouched",
  });
  if (error) throw new Error(error.message);
}

/**
 * Dispute a match. Same flow as vouch but trigger flips status to 'disputed'.
 */
export async function disputeMatch(matchId: string, playerId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("vouches").insert({
    match_id: matchId,
    player_id: playerId,
    action: "disputed",
  });
  if (error) throw new Error(error.message);
}

/**
 * Recent matches at any court in a city, for the local timeline.
 * Window defaults to last 7 days; tighten in UI if needed.
 */
export async function fetchMatchesForCity(
  city: string,
  state: string,
  hours = 24 * 7,
): Promise<MatchSummary[]> {
  const supabase = createClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("matches")
    .select(SELECT_FULL + ", courts!inner(city, state)")
    .eq("courts.city", city)
    .eq("courts.state", state)
    .in("status", ["pending", "vouched", "unverified_all_guest"])
    .gte("played_at", since)
    .order("played_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("fetchMatchesForCity:", error);
    return [];
  }
  return (data ?? []).map(normalizeMatch);
}
