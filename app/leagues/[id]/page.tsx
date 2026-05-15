import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import LeagueDashboard from "@/components/leagues/LeagueDashboard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeaguePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  const me = await getCurrentPlayer();
  const isAdmin = me?.id === league.created_by || me?.is_admin === true;

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/leagues"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Leagues
        </Link>
        <LeagueDashboard leagueId={id} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
