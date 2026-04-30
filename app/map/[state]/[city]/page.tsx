import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stateName } from "@/lib/states";
import { titleCase, unslugCity } from "@/lib/ladder";
import Wordmark from "@/components/Wordmark";
import AuthButton from "@/components/AuthButton";
import CourtLadder from "@/components/courts/CourtLadder";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string; city: string }>;
}

/**
 * City map view (PHASE 1 — list only).
 *
 * Phase 2 will replace this with a Mapbox GL JS interactive map showing
 * the city's roads with court markers. For now we render a clean list of
 * courts with their addresses + the existing CourtLadder widget per court.
 */
export default async function CityMapPage({ params }: PageProps) {
  const { state, city } = await params;
  const code = state.toUpperCase();
  const fullStateName = stateName(code);
  const cityName = titleCase(unslugCity(city));

  if (!fullStateName) notFound();

  const supabase = await createClient();
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, address, city, state, latitude, longitude, type")
    .ilike("state", code)
    .ilike("city", cityName)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (!courts || courts.length === 0) {
    notFound();
  }

  return (
    <main className="min-h-svh bg-black text-white">
      <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="block shrink-0">
            <Wordmark size="sm" />
            <span className="sr-only">PKLRALLY home</span>
          </Link>
          <div className="hidden sm:block h-8 w-px bg-white/20" />
          <div>
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              <Link
                href={`/map/${code.toLowerCase()}`}
                className="hover:text-bright"
              >
                {fullStateName}
              </Link>{" "}
              ›
            </p>
            <h1 className="font-display text-display-lg font-extrabold uppercase tracking-tight text-bright">
              {cityName}
            </h1>
          </div>
        </div>
        <AuthButton />
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        {/* Phase-2 hint: real Mapbox map slot. For now we keep this clean. */}
        <section className="rounded-2xl border-2 border-dashed border-pickle/30 bg-white/[0.02] p-6 text-center">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            Coming soon
          </p>
          <p className="mt-2 text-sm text-white/60">
            An interactive map of {cityName} with every court pinned and roads
            visible. Below: every active court in the city.
          </p>
        </section>

        <section className="mt-8">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            Courts · {courts.length}
          </p>
          <ul className="mt-3 space-y-3">
            {courts.map((c) => {
              const dotColor =
                c.type === "private" ? "bg-electric" : "bg-pickle";
              return (
                <li
                  key={c.id}
                  className="rounded-2xl border-2 border-pickle/30 bg-white/[0.02] p-4"
                >
                  <div className="flex items-start gap-3">
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
                        {c.type === "private" ? "Private court" : "Public court"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <CourtLadder courtId={c.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-2 text-sm">
          <Link
            href={`/map/${code.toLowerCase()}`}
            className="rounded-md border-2 border-white/30 px-3 py-1.5 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
          >
            ← All cities in {fullStateName}
          </Link>
          <Link
            href={`/ladder/${code.toLowerCase()}/${city}`}
            className="rounded-md border-2 border-pickle px-3 py-1.5 font-display text-display-xs uppercase font-bold tracking-wide text-pickle hover:bg-pickle hover:text-black"
          >
            View {cityName} ladder →
          </Link>
        </div>
      </div>
    </main>
  );
}
