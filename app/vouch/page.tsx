import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import MatchCard from "@/components/matches/MatchCard";
import Wordmark from "@/components/Wordmark";
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

export default async function VouchInboxPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/vouch");

  const supabase = await createClient();

  // 1) Pending matches where the viewer is in any slot — to be filtered to
  //    opposing-team-only afterward
  const { data: pendingRows } = await supabase
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

  const pending = (pendingRows ?? []).map(normalize).filter((m) => {
    const loggerOnServing =
      m.logged_by === m.server_team_p1?.id ||
      m.logged_by === m.server_team_p2?.id;
    const onReceiving =
      player.id === m.receiver_team_p1?.id ||
      player.id === m.receiver_team_p2?.id;
    const onServing =
      player.id === m.server_team_p1?.id ||
      player.id === m.server_team_p2?.id;
    return (
      (loggerOnServing && onReceiving) || (!loggerOnServing && onServing)
    );
  });

  // 2) Disputed matches the viewer logged — they need to fix or cancel
  const { data: disputedRows } = await supabase
    .from("matches")
    .select(SELECT_FULL)
    .eq("status", "disputed")
    .eq("logged_by", player.id)
    .order("played_at", { ascending: false })
    .limit(50);

  const disputed = (disputedRows ?? []).map(normalize);

  return (
    <main className="min-h-svh bg-black p-4 grid-bg">
      <header className="mx-auto flex max-w-2xl items-center justify-between">
        <Link href="/" className="block">
          <Wordmark size="md" />
          <span className="sr-only">PKLRALLY</span>
        </Link>
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Back
        </Link>
      </header>

      <div className="mx-auto mt-8 max-w-2xl space-y-10">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Vouch inbox
          </h1>
          <p className="mt-2 text-base text-white/60">
            Confirm or dispute matches your opponents have logged.
          </p>
        </div>

        {/* Disputed matches the viewer logged — needs their action */}
        {disputed.length > 0 && (
          <section>
            <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-electric">
              Needs your action ({disputed.length})
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Matches you logged that an opponent disputed. Fix the score and
              resubmit, or cancel the match.
            </p>
            <div className="mt-4 space-y-4">
              {disputed.map((m) => (
                <MatchCard key={m.id} match={m} viewerPlayerId={player.id} />
              ))}
            </div>
          </section>
        )}

        {/* Pending matches awaiting your vouch */}
        <section>
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Awaiting your vouch ({pending.length})
          </h2>
          <p className="mt-1 text-sm text-white/50">
            Matches your opponents logged. Confirm if the score is right,
            dispute if it's not.
          </p>
          <div className="mt-4 space-y-4">
            {pending.length === 0 && disputed.length === 0 ? (
              <div className="rounded-2xl border-2 border-white/20 p-8 text-center">
                <p className="font-display text-display-base font-bold text-white/70">
                  Nothing pending
                </p>
                <p className="mt-2 text-sm text-white/40">
                  When an opponent logs a match you played in, it'll show up
                  here for you to vouch.
                </p>
              </div>
            ) : (
              pending.map((m) => (
                <MatchCard key={m.id} match={m} viewerPlayerId={player.id} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
