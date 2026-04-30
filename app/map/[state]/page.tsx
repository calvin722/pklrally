import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stateName } from "@/lib/states";
import { citySlug } from "@/lib/ladder";
import Wordmark from "@/components/Wordmark";
import AuthButton from "@/components/AuthButton";
import StateMapWrapper from "@/components/StateMapWrapper";

// Always render on-demand. cookies() makes this impossible to pre-build.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string }>;
}

export default async function StatePage({ params }: PageProps) {
  const { state } = await params;
  const code = state.toUpperCase();
  const fullName = stateName(code);

  if (!fullName) notFound();

  const supabase = await createClient();
  const { data: courts } = await supabase
    .from("courts")
    .select("city, type, status")
    .ilike("state", code)
    .eq("status", "active");

  // Group by city
  type CitySummary = {
    city: string;
    courtCount: number;
    hasPrivate: boolean;
  };
  const byCity = new Map<string, CitySummary>();
  for (const c of courts ?? []) {
    const existing = byCity.get(c.city);
    if (existing) {
      existing.courtCount += 1;
      existing.hasPrivate = existing.hasPrivate || c.type === "private";
    } else {
      byCity.set(c.city, {
        city: c.city,
        courtCount: 1,
        hasPrivate: c.type === "private",
      });
    }
  }
  const cityList = Array.from(byCity.values()).sort((a, b) =>
    a.city.localeCompare(b.city),
  );

  return (
    <main className="relative flex h-svh w-full flex-col overflow-hidden bg-black">
      {/* Top bar */}
      <header className="relative z-30 flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="block shrink-0">
            <Wordmark size="sm" />
            <span className="sr-only">PKLRALLY home</span>
          </Link>
          <div className="hidden sm:block h-8 w-px bg-white/20" />
          <div>
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              State
            </p>
            <h1 className="font-display text-display-lg font-extrabold uppercase tracking-tight text-bright">
              {fullName}
            </h1>
          </div>
        </div>
        <AuthButton />
      </header>

      {/* Map fills the remaining space, with a side rail of cities */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r-2 border-pickle/30 bg-black/40 p-4 sm:block">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            Cities · {cityList.length}
          </p>
          {cityList.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">
              No active courts in {fullName} yet.{" "}
              <Link href="/courts/suggest" className="text-pickle hover:underline">
                Suggest one →
              </Link>
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {cityList.map((c) => (
                <li key={c.city}>
                  <Link
                    href={`/map/${code.toLowerCase()}/${citySlug(c.city)}`}
                    className="flex items-center justify-between rounded-lg border-2 border-white/10 bg-white/[0.02] px-3 py-2 transition hover:border-pickle hover:bg-pickle/10"
                  >
                    <span>
                      <span className="font-display text-display-sm font-bold text-white">
                        {c.city}
                      </span>
                      <span className="ml-2 font-mono text-xs uppercase tracking-wider text-white/50">
                        {c.courtCount} court{c.courtCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    {c.hasPrivate && (
                      <span className="rounded-full border border-electric px-1.5 py-0.5 font-display text-[9px] uppercase font-bold tracking-widest text-electric">
                        Private
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-white/10 pt-4">
            <Link
              href="/"
              className="font-display text-display-xs uppercase font-bold tracking-wide text-white/60 hover:text-pickle"
            >
              ← All states
            </Link>
          </div>
        </aside>

        <div className="relative flex-1">
          <StateMapWrapper stateCode={code} />
        </div>
      </div>

      {/* Mobile city list — bottom sheet */}
      <div className="relative z-20 max-h-[40vh] overflow-y-auto border-t-2 border-pickle/30 bg-black/80 p-3 backdrop-blur-sm sm:hidden">
        <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          Cities · {cityList.length}
        </p>
        {cityList.length === 0 ? (
          <p className="mt-2 text-xs text-white/50">No active courts yet.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {cityList.map((c) => (
              <li key={c.city}>
                <Link
                  href={`/map/${code.toLowerCase()}/${citySlug(c.city)}`}
                  className="block rounded-lg border-2 border-white/10 bg-white/[0.02] px-2 py-1.5 transition hover:border-pickle"
                >
                  <span className="block truncate font-display text-display-xs font-bold text-white">
                    {c.city}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
                    {c.courtCount} court{c.courtCount === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

