import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import MatchCard from "@/components/matches/MatchCard";
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
  server_team_p1:players!matches_server_team_p1_fkey (id, display_name, is_guest),
  server_team_p2:players!matches_server_team_p2_fkey (id, display_name, is_guest),
  receiver_team_p1:players!matches_receiver_team_p1_fkey (id, display_name, is_guest),
  receiver_team_p2:players!matches_receiver_team_p2_fkey (id, display_name, is_guest)
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

export default async function VouchInboxPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/vouch");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select(SELECT_FULL)
    .eq("status", "pending")
    .or(
      [
        `server_team_p1.eq.${player.id}`,
        `server_team_p2.eq.${player.id}`,
        `receiver_team_p1.eq.${player.id}`,
        `receiver_team_p2.eq.${player.id}`,
      ].join(","),
    )
    .order("played_at", { ascending: false })
    .limit(50);

  // Filter to opposing-team-only (logger and viewer on different sides)
  const allMatches = (data ?? []).map(normalize);
  const matches = allMatches.filter((m) => {
    const loggerOnServing =
      m.logged_by === m.server_team_p1?.id ||
      m.logged_by === m.server_team_p2?.id;
    const viewerOnReceiving =
      player.id === m.receiver_team_p1?.id ||
      player.id === m.receiver_team_p2?.id;
    const viewerOnServing =
      player.id === m.server_team_p1?.id ||
      player.id === m.server_team_p2?.id;
    return (
      (loggerOnServing && viewerOnReceiving) ||
      (!loggerOnServing && viewerOnServing)
    );
  });

  return (
    <main className="min-h-svh bg-black p-4 grid-bg">
      <header className="mx-auto flex max-w-2xl items-center justify-between">
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

      <div className="mx-auto mt-8 max-w-2xl">
        <h1 className="font-display text-display-2xl font-extrabold text-bright">
          Vouch inbox
        </h1>
        <p className="mt-2 text-base text-white/60">
          Confirm or dispute matches your opponents have logged.
        </p>

        {error && (
          <p className="mt-4 text-base text-bright">⚠ {error.message}</p>
        )}

        <div className="mt-8 space-y-4">
          {matches.length === 0 ? (
            <div className="rounded-2xl border-2 border-white/20 p-8 text-center">
              <p className="font-display text-display-base font-bold text-white/70">
                Nothing pending
              </p>
              <p className="mt-2 text-sm text-white/40">
                When an opponent logs a match you played in, it'll show up here
                for you to vouch.
              </p>
            </div>
          ) : (
            matches.map((m) => (
              <MatchCard key={m.id} match={m} viewerPlayerId={player.id} />
            ))
          )}
        </div>
      </div>
    </main>
  );
}
