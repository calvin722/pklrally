import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { citySlug, currentMonthKey, monthLabel } from "@/lib/ladder";

export const dynamic = "force-dynamic";

interface CityRow {
  city: string;
  state: string;
  court_count: number;
  has_sponsor: boolean;
}

/**
 * Ladder index — pick a city. Lists every city that has at least one active
 * court, with a small badge if it has an active sponsor this month.
 */
export default async function LadderIndexPage() {
  const supabase = await createClient();
  const monthKey = currentMonthKey();

  const { data: courtsRaw } = await supabase
    .from("courts")
    .select("city, state")
    .eq("status", "active");

  // Group courts by city+state
  const byCity = new Map<string, CityRow>();
  for (const c of courtsRaw ?? []) {
    const key = `${c.state.toUpperCase()}::${c.city.toLowerCase()}`;
    const existing = byCity.get(key);
    if (existing) {
      existing.court_count += 1;
    } else {
      byCity.set(key, {
        city: c.city,
        state: c.state.toUpperCase(),
        court_count: 1,
        has_sponsor: false,
      });
    }
  }

  // Mark which cities have an active sponsorship for this month
  const { data: sponsorships } = await supabase
    .from("sponsorships")
    .select("city, state")
    .eq("status", "active")
    .eq("month_key", monthKey);

  for (const s of sponsorships ?? []) {
    const key = `${s.state.toUpperCase()}::${s.city.toLowerCase()}`;
    const row = byCity.get(key);
    if (row) row.has_sponsor = true;
  }

  const cities = Array.from(byCity.values()).sort((a, b) =>
    a.state === b.state
      ? a.city.localeCompare(b.city)
      : a.state.localeCompare(b.state),
  );

  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-6 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle hover:text-bright"
        >
          ← PKLRALLY
        </Link>
      </div>

      <header className="mx-auto mt-8 max-w-3xl">
        <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          Monthly Ladder
        </p>
        <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
          Pick your city
        </h1>
        <p className="mt-1 font-mono text-sm uppercase tracking-wide text-white/60">
          {monthLabel(monthKey)}
        </p>
      </header>

      <section className="mx-auto mt-8 max-w-3xl">
        {cities.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-white/50">
            No active cities yet.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {cities.map((c) => (
              <li key={`${c.state}-${c.city}`}>
                <Link
                  href={`/ladder/${c.state.toLowerCase()}/${citySlug(c.city)}`}
                  className="flex items-center justify-between rounded-2xl border-2 border-pickle/30 bg-white/[0.03] p-4 transition hover:border-pickle hover:bg-pickle/10"
                >
                  <div>
                    <p className="font-display text-display-sm font-extrabold uppercase tracking-tight text-white">
                      {c.city}
                    </p>
                    <p className="font-mono text-xs uppercase tracking-wider text-white/50">
                      {c.state} · {c.court_count} court
                      {c.court_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {c.has_sponsor && (
                    <span className="rounded-full border border-bright px-2 py-0.5 font-display text-[10px] uppercase font-bold tracking-widest text-bright">
                      Sponsored
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
