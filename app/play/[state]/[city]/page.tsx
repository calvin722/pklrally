import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { titleCase, unslugCity } from "@/lib/ladder";
import { stateName } from "@/lib/states";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string; city: string }>;
}

/**
 * Find Open Play — court picker for one city. Each court shows the next-7-day
 * count of open-play blocks so you can quickly see where the action is.
 */
export default async function FindGameCityPage({ params }: PageProps) {
  const { state, city } = await params;
  const code = state.toUpperCase();
  const fullStateName = stateName(code);
  const cityName = titleCase(unslugCity(city));
  if (!fullStateName) notFound();

  const supabase = await createClient();

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, address, city, state, type")
    .ilike("state", code)
    .ilike("city", cityName)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (!courts || courts.length === 0) {
    notFound();
  }

  // Block counts per court (next 7 days, status open)
  const courtIds = courts.map((c) => c.id);
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { data: blocks } = await supabase
    .from("open_play_blocks")
    .select("court_id")
    .in("court_id", courtIds)
    .eq("status", "open")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", weekOut.toISOString());

  const blockCountByCourt = new Map<string, number>();
  for (const b of blocks ?? []) {
    blockCountByCourt.set(
      b.court_id,
      (blockCountByCourt.get(b.court_id) ?? 0) + 1,
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-pickle hover:opacity-80">
          <span aria-hidden className="font-display text-display-sm font-bold">←</span>
          <Wordmark size="xs" />
          <span className="sr-only">Back to PKLRALLY home</span>
        </Link>

        <header className="mt-8">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-electric">
            <Link href="/play" className="hover:text-bright">
              Find Open Play
            </Link>{" "}
            ›{" "}
            <Link href={`/play/${code.toLowerCase()}`} className="hover:text-bright">
              {fullStateName}
            </Link>{" "}
            ›
          </p>
          <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
            {cityName}
          </h1>
          <p className="mt-1 font-mono text-sm uppercase tracking-wide text-white/60">
            Pick a court
          </p>
        </header>

        <section className="mt-8">
          <ul className="space-y-3">
            {courts.map((c) => {
              const count = blockCountByCourt.get(c.id) ?? 0;
              const dotColor =
                c.type === "private" ? "bg-electric" : "bg-pickle";
              return (
                <li key={c.id}>
                  <Link
                    href={`/play/${code.toLowerCase()}/${city}/${c.id}`}
                    className="flex items-start gap-3 rounded-2xl border-2 border-electric/30 bg-white/[0.03] p-4 transition hover:border-electric hover:bg-electric/10"
                  >
                    <span
                      className={`mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full ${dotColor}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-display-base font-extrabold text-white">
                        {c.name}
                      </p>
                      {c.address && (
                        <p className="mt-0.5 text-sm text-white/60">
                          {c.address}
                        </p>
                      )}
                      <p className="mt-0.5 font-mono text-xs uppercase tracking-wider text-white/40">
                        {c.type === "private" ? "Private" : "Public"} court
                      </p>
                    </div>
                    {count > 0 ? (
                      <span className="rounded-full border border-electric px-2 py-1 font-display text-[10px] uppercase font-bold tracking-widest text-electric">
                        {count} game{count === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">
                        no games yet
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
