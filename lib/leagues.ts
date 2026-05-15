/**
 * Ladder leagues — King of the Court format.
 *
 * One league = one league night. The creator (admin) sets up the league,
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
// Types
// =====================================================================

export type LeagueStatus = "setup" | "in_progress" | "finished" | "cancelled";
export type LeagueFormat = "kotc" | "mixer";
export type PartnerMode = "shuffled" | "fixed";

export interface League {
  id: string;
  name: string;
  created_by: string;
  court_id: string | null;
  n_courts: number;
  n_rounds: number;
  win_bonus: number;
  format: LeagueFormat;
  partner_mode: PartnerMode;
  court_rules: string | null;
  status: LeagueStatus;
  current_round: number;
  player_order: string[];
  created_at: string;
  updated_at: string;
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
}

// =====================================================================
// CRUD
// =====================================================================

export async function createLeague(input: {
  name: string;
  createdBy: string;
  courtId?: string | null;
  nCourts: number;
  nRounds: number;
  winBonus: number;
  courtRules?: string | null;
  format?: LeagueFormat;
  partnerMode?: PartnerMode;
}): Promise<{ id: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leagues")
    .insert({
      name: input.name.trim(),
      created_by: input.createdBy,
      court_id: input.courtId ?? null,
      n_courts: input.nCourts,
      n_rounds: input.nRounds,
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

  return { league, players, rounds, matches, standings };
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
      player_order: ladder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);
  if (lgErr) throw new Error(`league update failed: ${lgErr.message}`);
}

/**
 * Save the score for one court's match. Sets winner column based on scores.
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
  const { error } = await supabase
    .from("league_matches")
    .update({
      team_a_score: scoreA,
      team_b_score: scoreB,
      winner: scoreA > scoreB ? "a" : "b",
      scored_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) throw new Error(error.message);
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

  const currentRound = rounds.find((r) => r.round_number === league.current_round);
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

  // If this was the last round, finish the league
  if (league.current_round >= league.n_rounds) {
    await supabase
      .from("leagues")
      .update({
        status: "finished",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leagueId);
    return;
  }

  // ---- Compute next round ----
  const nextRoundNumber = league.current_round + 1;
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
      player_order: newLadder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);
}

/** End the league night now (manual override before all rounds complete). */
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
