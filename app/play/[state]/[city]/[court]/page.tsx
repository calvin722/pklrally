import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { titleCase, unslugCity, citySlug } from "@/lib/ladder";
import { stateName } from "@/lib/states";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import Wordmark from "@/components/Wordmark";
import CourtPlaySchedule from "@/components/play/CourtPlaySchedule";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string; city: string; court: string }>;
}

export default async function CourtPlayPage({ params }: PageProps) {
  const { state, city, court: courtId } = await params;
  const code = state.toUpperCase();
  const fullStateName = stateName(code);
  const cityName = titleCase(unslugCity(city));
  if (!fullStateName) notFound();

  const supabase = await createClient();

  const { data: court } = await supabase
    .from("courts")
    .select("id, name, address, city, state, type, timezone")
    .eq("id", courtId)
    .eq("status", "active")
    .maybeSingle();

  if (!court) notFound();

  const me = await getCurrentPlayer();

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
              Find a Game
            </Link>{" "}
            ›{" "}
            <Link href={`/play/${code.toLowerCase()}`} className="hover:text-bright">
              {fullStateName}
            </Link>{" "}
            ›{" "}
            <Link
              href={`/play/${code.toLowerCase()}/${citySlug(cityName)}`}
              className="hover:text-bright"
            >
              {cityName}
            </Link>{" "}
            ›
          </p>
          <h1 className="mt-1 font-display text-display-2xl font-extrabold uppercase tracking-tight text-bright sm:text-display-3xl">
            {court.name}
          </h1>
          {court.address && (
            <p className="mt-1 text-sm text-white/60">{court.address}</p>
          )}
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-white/40">
            {court.type === "private" ? "Private" : "Public"} court · {cityName},{" "}
            {code}
          </p>
        </header>

        <CourtPlaySchedule
          courtId={court.id}
          courtName={court.name}
          timezone={court.timezone ?? "America/Denver"}
          currentPlayerId={me?.id ?? null}
          currentPlayerName={me?.display_name ?? null}
        />
      </div>
    </main>
  );
}
