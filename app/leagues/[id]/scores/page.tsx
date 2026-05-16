import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import ScoreEntry from "@/components/leagues/ScoreEntry";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScoresPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, n_courts, n_rounds, n_sessions, current_session, current_round, status, created_by, court_rules, win_bonus",
    )
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  const me = await getCurrentPlayer();
  const canEdit = me?.id === league.created_by || me?.is_admin === true;
  if (!canEdit) redirect(`/leagues/${id}`);

  if (league.status !== "in_progress") redirect(`/leagues/${id}`);

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/leagues/${id}`}
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ {league.name}
        </Link>

        <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
          {league.n_sessions > 1
            ? `Session ${league.current_session} · Round ${league.current_round}`
            : `Round ${league.current_round}`}{" "}
          — Enter Scores
        </h1>
        {league.court_rules && (
          <p className="mt-1 text-sm text-white/60">
            Rules: {league.court_rules}
          </p>
        )}
        <p className="mt-1 text-sm text-white/60">
          Win bonus: +{league.win_bonus} points to each winner.
        </p>

        <ScoreEntry leagueId={id} />
      </div>
    </div>
  );
}
