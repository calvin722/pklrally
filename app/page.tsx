"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthButton from "@/components/AuthButton";
import StartRallyButton from "@/components/StartRallyButton";
import Wordmark from "@/components/Wordmark";
import WelcomePopup from "@/components/WelcomePopup";
import CityTimeline from "@/components/matches/CityTimeline";
import CourtLadder from "@/components/courts/CourtLadder";
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
  const [selectedCity, setSelectedCity] = useState<CityNode | null>(null);

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

      {/* Start Rally — sits above the map, centered chunky banner */}
      <div className="z-20 flex justify-center px-4 py-4">
        <StartRallyButton
          className="w-full max-w-md"
          onClick={() => router.push("/rally/new")}
        />
      </div>

      {/* The map — fills remaining height */}
      <div className="relative min-h-0 flex-1">
        <USMap onCitySelect={setSelectedCity} />
      </div>

      {/* City takeover — full-screen panel for the timeline + courts */}
      {selectedCity && (
        <div className="no-scrollbar absolute inset-0 z-40 overflow-y-auto bg-black">
          <div className="mx-auto max-w-2xl p-5">
            <button
              type="button"
              onClick={() => setSelectedCity(null)}
              className="mb-4 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle"
              aria-label="Back to map"
            >
              ◀ Back to map
            </button>
            <h2 className="font-display text-display-2xl font-extrabold text-bright">
              {selectedCity.city}
            </h2>
            <p className="mt-1 text-base text-white/70">
              {selectedCity.state} · {selectedCity.recentMatches} matches last
              30 days
            </p>

            <div className="mt-8 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
              Courts
            </div>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {selectedCity.courts
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border-2 border-white/30 bg-black p-4 transition hover:border-pickle"
                  >
                    <div className="font-sans text-base font-medium text-white">
                      {c.name}
                    </div>
                    <div className="mt-1 font-display text-display-xs uppercase font-semibold tracking-wide text-white/60">
                      {c.type}
                    </div>
                    <CourtLadder courtId={c.id} />
                  </li>
                ))}
            </ul>

            <div className="mt-10 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
              Recent rallies
            </div>
            <div className="mt-3">
              <CityTimeline
                city={selectedCity.city}
                state={selectedCity.state}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
