import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { citySlug, currentMonthKey, monthLabel } from "@/lib/ladder";
import { stateName } from "@/lib/states";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string }>;
}

interface CityRow {
  city: string;
  courtCount: number;
  hasSponsor: boolean;
}

/**
 * Mid-level drill-down: lists every active city in a state with its
 * court count + sponsor flag. Click a city to see its monthly ladder.
 */
export default async function LadderStatePage({ params }: PageProps) {
  const { state } = await params;
  const code = state.toUpperCase();
  const fullName = stateName(code);
  if (!fullName) notFound();

  const supabase = await createClient();

  let monthKey = currentMonthKey();
  try {
    const { data: leagueMonth } = await supabase.rpc(
      "current_league_month_key",
    );
    if (typeof leagueMonth === "string") monthKey = leagueMonth;
  } catch {
    /* fall back */
  }

  const { data: courts } = await supabase
    .from("courts")
    .select("city, state")
    .ilike("state", code)
    .eq("status", "active");

  const byCity = new Map<string, CityRow>();
  for (const c of courts ?? []) {
    const k = c.city.toLowerCase();
    const existing = byCity.get(k);
    if (existing) {
      existing.courtCount += 1;
    } else {
      byCity.set(k, {
        city: c.city,
        courtCount: 1,
        hasSponsor: false,
      });
    }
  }

  // Sponsor flags
  const { data: sponsorships } = await supabase
    .from("sponsorships")
    .select("city")
    .ilike("state", code)
    .eq("status", "active")
    .eq("month_key", monthKey);

  for (const s of sponsorships ?? []) {
    const row = byCity.get(s.city.toLowerCase());
    if (row) row.hasSponsor = true;
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
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            <Link href="/ladder" className="hover:text-bright">
              Monthly Ladder
            </Link>{" "}
            ›
          </p>
          <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
            {fullName}
          </h1>
          <p className="mt-1 font-mono text-sm uppercase tracking-wide text-white/60">
            {monthLabel(monthKey)}
          </p>
        </header>

        <section className="mt-8">
          {cities.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-white/50">
              No active courts in {fullName} yet.{" "}
              <Link href="/courts/suggest" className="text-pickle hover:underline">
                Suggest one →
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {cities.map((c) => (
                <li key={c.city}>
                  <Link
                    href={`/ladder/${code.toLowerCase()}/${citySlug(c.city)}`}
                    className="flex items-center justify-between rounded-2xl border-2 border-pickle/30 bg-white/[0.03] p-4 transition hover:border-pickle hover:bg-pickle/10"
                  >
                    <div>
                      <p className="font-display text-display-md font-extrabold uppercase tracking-tight text-white">
                        {c.city}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-wider text-white/50">
                        {c.courtCount} court{c.courtCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {c.hasSponsor && (
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

        <div className="mt-6 flex justify-center">
          <Link
            href="/ladder"
            className="font-display text-display-xs uppercase font-bold tracking-wide text-white/60 hover:text-pickle"
          >
            ← All states
          </Link>
        </div>
      </div>
    </main>
  );
}
