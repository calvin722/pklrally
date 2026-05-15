import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LeagueStatsGrid from "@/components/leagues/LeagueStatsGrid";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeagueStatsPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, n_rounds")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/leagues/${id}`}
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ {league.name}
        </Link>
        <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
          Player Stats
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Points earned each round. Filled dot = win, ring = loss, dim &times; = bye.
        </p>
        <LeagueStatsGrid leagueId={id} />
      </div>
    </div>
  );
}
