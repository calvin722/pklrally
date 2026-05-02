import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { citySlug } from "@/lib/ladder";
import { stateName } from "@/lib/states";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string }>;
}

interface CityRow {
  city: string;
  courtCount: number;
  upcomingCount: number;
}

/**
 * Find Open Play — city picker for one state.
 */
export default async function FindGameStatePage({ params }: PageProps) {
  const { state } = await params;
  const code = state.toUpperCase();
  const fullName = stateName(code);
  if (!fullName) notFound();

  const supabase = await createClient();

  const { data: courts } = await supabase
    .from("courts")
    .select("city, state")
    .ilike("state", code)
    .eq("status", "active");

  const byCity = new Map<string, CityRow>();
  for (const c of courts ?? []) {
    const k = c.city.toLowerCase();
    const existing = byCity.get(k);
    if (existing) existing.courtCount += 1;
    else byCity.set(k, { city: c.city, courtCount: 1, upcomingCount: 0 });
  }

  // Count upcoming blocks per city (next 7 days)
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { data: blocks } = await supabase
    .from("open_play_blocks")
    .select("court:courts (city, state)")
    .eq("status", "open")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", weekOut.toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);
  for (const b of (blocks ?? []) as Array<{ court: unknown }>) {
    const court = j(b.court);
    if (!court?.city) continue;
    if (String(court.state).toUpperCase() !== code) continue;
    const row = byCity.get(String(court.city).toLowerCase());
    if (row) row.upcomingCount += 1;
  }

  const cities = Array.from(byCity.values()).sort((a, b) =>
    a.city.localeCompare(b.city),
  );

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
            ›
          </p>
          <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
            {fullName}
          </h1>
        </header>

        <section className="mt-8">
          {cities.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-white/50">
              No active courts in {fullName} yet.{" "}
              <Link href="/courts/suggest" className="text-electric hover:underline">
                Suggest one →
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {cities.map((c) => (
                <li key={c.city}>
                  <Link
                    href={`/play/${code.toLowerCase()}/${citySlug(c.city)}`}
                    className="flex items-center justify-between rounded-2xl border-2 border-electric/30 bg-white/[0.03] p-4 transition hover:border-electric hover:bg-electric/10"
                  >
                    <div>
                      <p className="font-display text-display-md font-extrabold uppercase tracking-tight text-white">
                        {c.city}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-wider text-white/50">
                        {c.courtCount} court{c.courtCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {c.upcomingCount > 0 ? (
                      <span className="rounded-full border border-electric px-2 py-0.5 font-display text-[10px] uppercase font-bold tracking-widest text-electric">
                        {c.upcomingCount} game{c.upcomingCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">
                        no games
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-6 flex justify-center">
          <Link
            href="/play"
            className="font-display text-display-xs uppercase font-bold tracking-wide text-white/60 hover:text-electric"
          >
            ← All states
          </Link>
        </div>
      </div>
    </main>
  );
}
