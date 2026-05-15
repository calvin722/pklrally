import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import CreateLeagueForm from "@/components/leagues/CreateLeagueForm";

export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/leagues/new");

  return (
    <div className="min-h-svh bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/leagues"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Leagues
        </Link>

        <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
          Create a league
        </h1>
        <p className="mt-2 text-base text-white/60">
          You&rsquo;ll be the league admin — you run the rounds, enter scores,
          and advance the league.
        </p>

        <CreateLeagueForm playerId={player.id} />
      </div>
    </div>
  );
}
