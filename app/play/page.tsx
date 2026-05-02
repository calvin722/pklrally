import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { stateName } from "@/lib/states";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

interface StateRow {
  state: string;
  cityCount: number;
  upcomingCount: number;
}

/**
 * Find a Game — top-level state picker. Lists every state with active
 * courts, plus a count of upcoming open-play blocks (next 7 days).
 */
export default async function FindGamePage() {
  const supabase = await createClient();

  const { data: courts } = await supabase
    .from("courts")
    .select("city, state")
    .eq("status", "active");

  const byState = new Map<string, StateRow>();
  const distinctCities = new Map<string, Set<string>>();
  for (const c of courts ?? []) {
    const key = c.state.toUpperCase();
    if (!byState.has(key)) {
      byState.set(key, { state: key, cityCount: 0, upcomingCount: 0 });
    }
    if (!distinctCities.has(key)) distinctCities.set(key, new Set());
    distinctCities.get(key)!.add(c.city.toLowerCase());
  }
  for (const [state, cities] of distinctCities.entries()) {
    const row = byState.get(state);
    if (row) row.cityCount = cities.size;
  }

  // Count upcoming blocks per state (next 7 days, status open)
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { data: blocks } = await supabase
    .from("open_play_blocks")
    .select("court:courts (state)")
    .eq("status", "open")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", weekOut.toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);
  for (const b of (blocks ?? []) as Array<{ court: unknown }>) {
    const court = j(b.court);
    if (!court?.state) continue;
    const row = byState.get(String(court.state).toUpperCase());
    if (row) row.upcomingCount += 1;
  }

  const states = Array.from(byState.values()).sort((a, b) =>
    a.state.localeCompare(b.state),
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
            Find a Game
          </p>
          <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
            Pick your state
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Open-play sessions at courts near you. Show up, rotate in, and
            log your matches after.
          </p>
        </header>

        <section className="mt-8">
          {states.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-white/50">
              No active states yet. Add a court to get the first game on the
              calendar.{" "}
              <Link href="/courts/suggest" className="text-electric hover:underline">
                Suggest a court →
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {states.map((s) => (
                <li key={s.state}>
                  <Link
                    href={`/play/${s.state.toLowerCase()}`}
                    className="flex items-center justify-between rounded-2xl border-2 border-electric/30 bg-white/[0.03] p-4 transition hover:border-electric hover:bg-electric/10"
                  >
                    <div>
                      <p className="font-display text-display-md font-extrabold uppercase tracking-tight text-white">
                        {stateName(s.state) ?? s.state}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-wider text-white/50">
                        {s.state} · {s.cityCount} cit
                        {s.cityCount === 1 ? "y" : "ies"}
                      </p>
                    </div>
                    {s.upcomingCount > 0 ? (
                      <span className="rounded-full border border-electric px-2 py-0.5 font-display text-[10px] uppercase font-bold tracking-widest text-electric">
                        {s.upcomingCount} game{s.upcomingCount === 1 ? "" : "s"}
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
      </div>
    </main>
  );
}
