import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import EditLeagueForm from "@/components/leagues/EditLeagueForm";
import type { League, LeaguePrize } from "@/lib/leagues";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditLeaguePage({ params }: PageProps) {
  const { id } = await params;

  const me = await getCurrentPlayer();
  if (!me) redirect(`/login?next=/leagues/${id}/edit`);

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound();

  if (league.created_by !== me.id && !me.is_admin) {
    redirect(`/leagues/${id}`);
  }
  if (league.status !== "setup") {
    // Once started, details lock — bounce back to the dashboard.
    redirect(`/leagues/${id}`);
  }

  const { data: prizesRaw } = await supabase
    .from("league_prizes")
    .select("*")
    .eq("league_id", id)
    .order("place", { ascending: true });

  const prizes: LeaguePrize[] = (prizesRaw ?? []).map((p) => {
    let publicUrl: string | null = null;
    if (p.sponsor_image_path) {
      const { data } = supabase.storage
        .from("league-prizes")
        .getPublicUrl(p.sponsor_image_path);
      publicUrl = data.publicUrl;
    }
    return { ...p, sponsor_image_url: publicUrl } as LeaguePrize;
  });

  return (
    <div className="min-h-svh bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/leagues/${id}`}
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ {league.name}
        </Link>

        <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
          Edit league details
        </h1>
        <p className="mt-2 text-base text-white/60">
          Any field is editable until you press &ldquo;Start League&rdquo; on the
          dashboard. After that, details lock.
        </p>

        <EditLeagueForm league={league as League} prizes={prizes} />
      </div>
    </div>
  );
}
