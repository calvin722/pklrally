"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AuthButton from "@/components/AuthButton";
import FindGameButton from "@/components/FindGameButton";
import Wordmark from "@/components/Wordmark";
import WelcomePopup from "@/components/WelcomePopup";
import { citySlug } from "@/lib/ladder";
import type { CityNode } from "@/lib/types";

const USMap = dynamic(() => import("@/components/USMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <span className="font-display text-display-sm uppercase font-semibold tracking-wide text-pickle animate-flicker">
        Loading map...
      </span>
    </div>
  ),
});

export default function HomePage() {
  const router = useRouter();

  // Map city click → /play/[state]/[city] (Find a Game flow).
  // Replaces the previous in-page recent-rallies panel.
  function handleCitySelect(city: CityNode | null) {
    if (!city) return;
    const stateLower = city.state.toLowerCase();
    router.push(`/play/${stateLower}/${citySlug(city.city)}`);
  }

  return (
    <main className="relative flex h-svh w-full flex-col overflow-hidden bg-black">
      <WelcomePopup />
      {/* Top bar — wordmark + sign-in */}
      <header className="relative z-30 flex items-center justify-between px-4 pt-4">
        <div>
          <Wordmark size="lg" priority />
          <h1 className="sr-only">PKLRALLY</h1>
          <p className="mt-1 text-sm text-white/60">
            Play, Track &amp; Win
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <AuthButton />
        </nav>
      </header>

      {/* CTAs — Find Open Play + Start a Ladder League above the map */}
      <div className="z-20 flex justify-center gap-3 px-4 py-4">
        <FindGameButton
          className="flex-1 max-w-xs"
          onClick={() => router.push("/play")}
        />
        <button
          type="button"
          onClick={() => router.push("/leagues")}
          className="flex flex-1 max-w-xs flex-col items-center justify-center rounded-lg border-2 border-pickle bg-pickle px-4 py-3 text-black transition hover:bg-bright"
        >
          <span className="font-display text-display-base font-extrabold uppercase tracking-wide">
            🏆 Start a Ladder League
          </span>
          <span className="text-xs font-semibold">
            run a ladder · win local prizes
          </span>
        </button>
      </div>

      {/* The map — fills remaining height. State + city clicks both
          route into the Find a Game flow. */}
      <div className="relative min-h-0 flex-1">
        <USMap onCitySelect={handleCitySelect} />
      </div>
    </main>
  );
}
