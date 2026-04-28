import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import RallyFlow from "@/components/rally/RallyFlow";

export const dynamic = "force-dynamic";

interface DefaultCourt {
  id: string;
  name: string;
  city: string;
  state: string;
}

/**
 * Find the most recent court this player logged a match at.
 * Inlined here (server-side) instead of in lib/rally.ts so we don't pull
 * the client-side supabase module into the server graph.
 */
async function getLastCourtForPlayer(
  playerId: string,
): Promise<DefaultCourt | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("courts(id, name, city, state)")
    .eq("logged_by", playerId)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.courts) return null;
  // PostgREST may return the join as an object or array — normalize.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (Array.isArray(data.courts) ? data.courts[0] : data.courts) as any;
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    state: c.state,
  };
}

export default async function StartRallyPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/rally/new");

  const defaultCourt = await getLastCourtForPlayer(player.id);

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
          Log a rally
        </h1>
        <p className="mt-2 text-base text-white/60">
          Just finished a game? Tap your way through the court below.
        </p>

        <div className="mt-8">
          <RallyFlow
            me={{ id: player.id, displayName: player.display_name }}
            defaultCourt={defaultCourt}
          />
        </div>
      </div>
    </main>
  );
}
