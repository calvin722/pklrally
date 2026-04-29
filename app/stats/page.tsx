import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import MatchCard from "@/components/matches/MatchCard";
import CompactMatchRow from "@/components/matches/CompactMatchRow";
import Avatar from "@/components/Avatar";
import PickleballRating from "@/components/PickleballRating";
import type { MatchSummary } from "@/lib/matches";

export const dynamic = "force-dynamic";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(row: any): MatchSummary {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? (v[0] ?? null) : v ?? null);
  return {
    id: row.id,
    played_at: row.played_at,
    status: row.status,
    server_score: row.server_score,
    receiver_score: row.receiver_score,
    logged_by: row.logged_by,
    court: j(row.court),
    server_team_p1: j(row.server_team_p1),
    server_team_p2: j(row.server_team_p2),
    receiver_team_p1: j(row.receiver_team_p1),
    receiver_team_p2: j(row.receiver_team_p2),
  };
}

function viewerWon(match: MatchSummary, viewerId: string): boolean {
  const onServing =
    viewerId === match.server_team_p1?.id ||
    viewerId === match.server_team_p2?.id;
  const serverWon = match.server_score > match.receiver_score;
  return onServing ? serverWon : !serverWon;
}

export default async function StatsPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/stats");

  const supabase = await createClient();

  // Pull all vouched matches involving the viewer (sorted oldest first for streak calc)
  const { data: matchRows } = await supabase
    .from("matches")
    .select(SELECT_FULL)
    .eq("status", "vouched")
    .or(
      [
        `server_team_p1.eq.${player.id}`,
        `server_team_p2.eq.${player.id}`,
        `receiver_team_p1.eq.${player.id}`,
        `receiver_team_p2.eq.${player.id}`,
      ].join(","),
    )
    .order("played_at", { ascending: true })
    .limit(500);

  const allMatches = (matchRows ?? []).map(normalize);

  // Streak math (over chronological order)
  let currentStreak = 0;
  let bestStreak = 0;
  let runStreak = 0;
  for (const m of allMatches) {
    const won = viewerWon(m, player.id);
    if (won) {
      runStreak += 1;
      if (runStreak > bestStreak) bestStreak = runStreak;
    } else {
      runStreak = 0;
    }
  }
  // Walk backward to find current streak (consecutive wins from most recent)
  for (let i = allMatches.length - 1; i >= 0; i--) {
    if (viewerWon(allMatches[i], player.id)) currentStreak += 1;
    else break;
  }

  // This month metrics
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = allMatches.filter(
    (m) => new Date(m.played_at) >= monthStart,
  );
  const thisMonthWins = thisMonth.filter((m) => viewerWon(m, player.id)).length;

  // Recent (last 10, newest first)
  const recent = allMatches.slice(-10).reverse();

  const winRate =
    player.matches_played > 0
      ? Math.round((player.wins / player.matches_played) * 100)
      : null;

  const avgPoints =
    player.matches_played > 0
      ? (player.points_scored / player.matches_played).toFixed(1)
      : "—";

  // "April 2026"
  const monthLabel = new Date().toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-svh bg-black p-4 grid-bg">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <Link
          href="/"
          className="font-display text-display-lg font-extrabold leading-none text-pickle"
        >
          PKL<span className="text-bright">RALLY</span>
        </Link>
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Back
        </Link>
      </header>

      <div className="mx-auto mt-8 max-w-3xl space-y-6">
        {/* Identity row */}
        <section className="flex items-center gap-4 rounded-2xl border-2 border-pickle bg-black p-5 neon-pickle">
          <Avatar player={player} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-display-2xl font-extrabold text-bright">
              Your stats
            </h1>
            <p className="text-base text-white/70">
              {player.display_name}
              {player.dupr_self_rating !== null && (
                <span className="ml-3 inline-block align-middle">
                  <PickleballRating value={player.dupr_self_rating} size={14} />
                </span>
              )}
            </p>
          </div>
        </section>

        {/* Lifetime hero */}
        <section className="rounded-2xl border-2 border-white/30 bg-black p-6">
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Lifetime
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Matches" value={player.matches_played} />
            <Stat label="Wins" value={player.wins} accent="pickle" />
            <Stat label="Losses" value={player.losses} accent="bright" />
            <Stat
              label="Win %"
              value={winRate !== null ? `${winRate}%` : "—"}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Points scored" value={player.points_scored} />
            <Stat label="Points against" value={player.points_against} />
            <Stat label="Avg points / game" value={avgPoints} />
          </div>
        </section>

        {/* This month */}
        <section className="rounded-2xl border-2 border-white/30 bg-black p-6">
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            This month — {monthLabel}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Matches" value={thisMonth.length} />
            <Stat label="Wins" value={thisMonthWins} accent="pickle" />
            <Stat
              label="Win %"
              value={
                thisMonth.length > 0
                  ? `${Math.round((thisMonthWins / thisMonth.length) * 100)}%`
                  : "—"
              }
            />
          </div>
        </section>

        {/* Streaks */}
        <section className="rounded-2xl border-2 border-white/30 bg-black p-6">
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Streaks
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat
              label="Current win streak"
              value={currentStreak}
              accent="pickle"
            />
            <Stat
              label="Best win streak"
              value={bestStreak}
              accent="bright"
            />
          </div>
        </section>

        {/* Rankings — placeholders for now */}
        <section className="rounded-2xl border-2 border-white/30 bg-black p-6">
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Rankings
          </h2>
          <p className="mt-2 text-sm text-white/50">
            Court · city · state · national rankings drop in the next phase.
            Your matches are already counting toward them.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RankPlaceholder label="At your court" />
            <RankPlaceholder label="In your city" />
            <RankPlaceholder label="In your state" />
            <RankPlaceholder label="Nationally" />
          </div>
        </section>

        {/* Recent matches — first expanded, rest collapsed to one-liners */}
        <section>
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Recent matches
          </h2>
          {recent.length === 0 ? (
            <div className="mt-4 rounded-2xl border-2 border-white/20 p-8 text-center">
              <p className="font-display text-display-base font-bold text-white/70">
                No vouched matches yet
              </p>
              <p className="mt-2 text-sm text-white/40">
                Log a match from the homepage and have an opponent vouch it,
                and it'll show up here.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4">
                <MatchCard
                  match={recent[0]}
                  viewerPlayerId={player.id}
                  compact
                />
              </div>
              {recent.length > 1 && (
                <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-xl border-2 border-white/20">
                  {recent.slice(1).map((m) => (
                    <CompactMatchRow
                      key={m.id}
                      match={m}
                      viewerWon={viewerWon(m, player.id)}
                      viewerPlayerId={player.id}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "pickle" | "bright";
}) {
  const color =
    accent === "pickle"
      ? "text-pickle"
      : accent === "bright"
        ? "text-bright"
        : "text-white";
  return (
    <div className="rounded-xl border-2 border-white/20 p-4">
      <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60">
        {label}
      </div>
      <div className={`mt-2 font-mono text-display-xl font-bold ${color}`}>
        {value}
      </div>
    </div>
  );
}

function RankPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-white/20 p-4">
      <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/40">
        {label}
      </div>
      <div className="mt-2 font-mono text-display-xl font-bold text-white/30">
        —
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-white/30">
        Coming soon
      </div>
    </div>
  );
}

