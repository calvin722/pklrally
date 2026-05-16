import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

export const dynamic = "force-dynamic";

interface LeagueRow {
  id: string;
  name: string;
  status: string;
  scheduled_at: string | null;
  win_bonus: number;
  n_rounds: number;
  n_sessions: number;
}

interface MatchRow {
  id: string;
  league_id: string;
  team_a_p1: string;
  team_a_p2: string;
  team_b_p1: string;
  team_b_p2: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner: "a" | "b" | null;
}

interface LeagueStat {
  league: LeagueRow;
  myPoints: number;
  myWins: number;
  myLosses: number;
  myGames: number;
  myRank: number | null;       // null if not yet finished or not enough data
  totalPlayers: number;
}

export default async function StatsPage() {
  const me = await getCurrentPlayer();
  if (!me) redirect("/login?next=/stats");

  const supabase = await createClient();

  // 1. Leagues this player is in
  const { data: lpRows } = await supabase
    .from("league_players")
    .select("league_id")
    .eq("player_id", me.id);
  const leagueIds = (lpRows ?? []).map((r) => r.league_id);

  if (leagueIds.length === 0) {
    return <EmptyState name={me.display_name} />;
  }

  // 2. League rows + all matches in those leagues
  const [{ data: leaguesRaw }, { data: matchesRaw }, { data: allLpRaw }] =
    await Promise.all([
      supabase
        .from("leagues")
        .select(
          "id, name, status, scheduled_at, win_bonus, n_rounds, n_sessions",
        )
        .in("id", leagueIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("league_matches")
        .select(
          "id, league_id, team_a_p1, team_a_p2, team_b_p1, team_b_p2, team_a_score, team_b_score, winner",
        )
        .in("league_id", leagueIds),
      supabase
        .from("league_players")
        .select("league_id, player_id")
        .in("league_id", leagueIds),
    ]);

  const leagues = (leaguesRaw ?? []) as LeagueRow[];
  const matches = (matchesRaw ?? []) as MatchRow[];
  const lpAll = allLpRaw ?? [];

  // Player count per league (for context)
  const playerCount = new Map<string, number>();
  for (const r of lpAll)
    playerCount.set(r.league_id, (playerCount.get(r.league_id) ?? 0) + 1);

  // Aggregate stats per league
  const perLeague: LeagueStat[] = leagues.map((lg) => {
    // Tally per-player points for THIS league (to derive my rank)
    const tally = new Map<
      string,
      { points: number; wins: number; losses: number; games: number }
    >();
    function add(pid: string, points: number, win: boolean) {
      const cur = tally.get(pid) ?? {
        points: 0,
        wins: 0,
        losses: 0,
        games: 0,
      };
      cur.points += points;
      cur.games += 1;
      if (win) cur.wins += 1;
      else cur.losses += 1;
      tally.set(pid, cur);
    }
    for (const m of matches) {
      if (m.league_id !== lg.id) continue;
      if (m.team_a_score === null || m.team_b_score === null) continue;
      const aWon = m.winner === "a";
      const winScore = aWon ? m.team_a_score : m.team_b_score;
      const loseScore = aWon ? m.team_b_score : m.team_a_score;
      const winners = aWon
        ? [m.team_a_p1, m.team_a_p2]
        : [m.team_b_p1, m.team_b_p2];
      const losers = aWon
        ? [m.team_b_p1, m.team_b_p2]
        : [m.team_a_p1, m.team_a_p2];
      for (const p of winners) add(p, winScore + lg.win_bonus, true);
      for (const p of losers) add(p, loseScore, false);
    }
    const me_stat = tally.get(me.id);
    const sorted = Array.from(tally.entries()).sort(
      (a, b) => b[1].points - a[1].points,
    );
    const myIndex = sorted.findIndex(([pid]) => pid === me.id);
    return {
      league: lg,
      myPoints: me_stat?.points ?? 0,
      myWins: me_stat?.wins ?? 0,
      myLosses: me_stat?.losses ?? 0,
      myGames: me_stat?.games ?? 0,
      myRank: myIndex >= 0 ? myIndex + 1 : null,
      totalPlayers: playerCount.get(lg.id) ?? 0,
    };
  });

  // Aggregate totals across all leagues
  const totals = perLeague.reduce(
    (acc, l) => {
      acc.points += l.myPoints;
      acc.wins += l.myWins;
      acc.losses += l.myLosses;
      acc.games += l.myGames;
      return acc;
    },
    { points: 0, wins: 0, losses: 0, games: 0 },
  );
  const winRate =
    totals.games > 0 ? (totals.wins / totals.games) * 100 : 0;
  const podiums = perLeague.filter(
    (l) => l.league.status === "finished" && l.myRank !== null && l.myRank <= 3,
  ).length;
  const bestRank = perLeague
    .filter((l) => l.myRank !== null)
    .reduce<number | null>(
      (best, l) =>
        best === null ? l.myRank : Math.min(best, l.myRank as number),
      null,
    );

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Home
        </Link>
        <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
          My Stats
        </h1>
        <p className="mt-2 text-base text-white/60">
          Your performance across every league you&rsquo;ve played in.
        </p>

        <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <BigStat label="Leagues" value={leagues.length} />
          <BigStat label="Total points" value={totals.points} />
          <BigStat label="W–L" value={`${totals.wins}–${totals.losses}`} />
          <BigStat
            label="Win rate"
            value={totals.games > 0 ? `${winRate.toFixed(0)}%` : "—"}
          />
          <BigStat label="Podium finishes" value={podiums} />
        </div>

        {bestRank !== null && (
          <div className="mt-3 inline-block rounded-lg border-2 border-bright bg-bright/5 px-4 py-2 text-sm">
            <span className="text-bright">★ Best finish:</span>{" "}
            <strong className="text-white">#{bestRank}</strong>
          </div>
        )}

        <h2 className="mt-10 font-display text-display-base font-bold text-white">
          League history
        </h2>
        <div className="mt-3 space-y-3">
          {perLeague.length === 0 && (
            <div className="text-white/50">No leagues yet.</div>
          )}
          {perLeague.map((l) => (
            <Link
              key={l.league.id}
              href={`/leagues/${l.league.id}`}
              className="block rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-4 transition hover:border-pickle hover:bg-pickle/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display text-display-base font-extrabold text-bright">
                    {l.league.name}
                  </div>
                  <div className="mt-0.5 text-xs text-white/60">
                    {l.league.status === "finished"
                      ? "Finished"
                      : l.league.status === "in_progress"
                        ? "Live"
                        : "Setup"}
                    {l.league.scheduled_at && (
                      <>
                        {" · "}
                        {new Date(l.league.scheduled_at).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </>
                    )}
                    {l.league.n_sessions > 1 && (
                      <> · {l.league.n_sessions} sessions</>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {l.myRank !== null && (
                    <RankBadge
                      rank={l.myRank}
                      total={l.totalPlayers}
                      finished={l.league.status === "finished"}
                    />
                  )}
                  <span className="rounded-md border-2 border-white/15 px-2 py-1 font-mono text-white">
                    {l.myPoints} pts
                  </span>
                  <span className="rounded-md border-2 border-white/15 px-2 py-1 font-mono text-white/70">
                    {l.myWins}–{l.myLosses}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border-2 border-pickle bg-pickle/5 p-4 text-center">
      <div className="font-display text-display-xl font-extrabold text-pickle">
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-white/60">
        {label}
      </div>
    </div>
  );
}

function RankBadge({
  rank,
  total,
  finished,
}: {
  rank: number;
  total: number;
  finished: boolean;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  const podium = rank <= 3 && finished;
  return (
    <span
      className={`rounded-md px-2 py-1 font-display text-display-xs font-bold uppercase tracking-wide ${
        podium ? "bg-bright text-black" : "border-2 border-pickle/40 text-pickle"
      }`}
    >
      {medal ? `${medal} ` : "#"}
      {rank}
      {total > 0 && ` of ${total}`}
    </span>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Home
        </Link>
        <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
          My Stats
        </h1>
        <div className="mt-8 rounded-2xl border-2 border-dashed border-white/20 p-10 text-center">
          <div className="text-3xl">🎾</div>
          <p className="mt-3 text-white/80">
            Hey {name} — you haven&rsquo;t played in a league yet.
          </p>
          <p className="mt-1 text-sm text-white/50">
            Stats build up as you join leagues and the rounds get played.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/leagues"
              className="rounded-lg bg-pickle px-5 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black hover:bg-bright"
            >
              Browse leagues →
            </Link>
            <Link
              href="/play"
              className="rounded-lg border-2 border-pickle px-5 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black"
            >
              Find open play
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
