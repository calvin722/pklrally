"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCourtsForPicker } from "@/lib/rally";

interface Court {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface CourtPickerProps {
  selectedId: string | null;
  onChange: (court: Court | null) => void;
}

type Step = "state" | "city" | "court" | "search";

/**
 * Drill-down court picker: State → City → Court.
 *   - Only states with at least one active court appear at step 1.
 *   - Tapping a state shows only cities in that state with active courts.
 *   - Tapping a city shows only courts in that city.
 * A small "search by name" toggle in the corner reveals the original
 * flat search list for power users who'd rather just type.
 */
export default function CourtPicker({ selectedId, onChange }: CourtPickerProps) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("state");
  const [pickedState, setPickedState] = useState<string | null>(null);
  const [pickedCity, setPickedCity] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCourtsForPicker().then((data) => {
      if (alive) {
        setCourts(data);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const states = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of courts) {
      const s = c.state.toUpperCase();
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [courts]);

  const cities = useMemo(() => {
    if (!pickedState) return [];
    const map = new Map<string, number>();
    for (const c of courts) {
      if (c.state.toUpperCase() !== pickedState) continue;
      const key = c.city;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => a.city.localeCompare(b.city));
  }, [courts, pickedState]);

  const cityCourts = useMemo(() => {
    if (!pickedState || !pickedCity) return [];
    return courts
      .filter(
        (c) =>
          c.state.toUpperCase() === pickedState &&
          c.city.toLowerCase() === pickedCity.toLowerCase(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [courts, pickedState, pickedCity]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return courts;
    const q = search.trim().toLowerCase();
    return courts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q),
    );
  }, [courts, search]);

  const selected = courts.find((c) => c.id === selectedId) ?? null;

  // ============ Selected state — show the chosen court + change button
  if (selected) {
    return (
      <div className="rounded-xl border-2 border-pickle bg-black p-4 neon-pickle">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-display-base font-bold text-white">
              {selected.name}
            </div>
            <div className="mt-0.5 text-sm text-white/60">
              {selected.city}, {selected.state}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setStep("state");
              setPickedState(null);
              setPickedCity(null);
              setSearch("");
            }}
            className="rounded-lg border-2 border-white/40 px-3 py-1.5 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border-2 border-white/20 bg-black p-4 text-sm text-white/50">
        Loading courts…
      </div>
    );
  }

  // ============ Search mode — flat list
  if (step === "search") {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or city"
            className="w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setStep("state");
              setSearch("");
            }}
            className="shrink-0 rounded-lg border-2 border-white/30 px-3 py-3 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
          >
            Browse
          </button>
        </div>
        <ul className="no-scrollbar mt-3 max-h-72 space-y-1 overflow-y-auto">
          {searchResults.length === 0 && (
            <li className="rounded-lg border-2 border-white/20 p-4 text-center text-sm text-white/40">
              No courts match &quot;{search}&quot;.
            </li>
          )}
          {searchResults.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange(c)}
                className="w-full rounded-lg border-2 border-white/20 bg-black p-3 text-left transition hover:border-pickle hover:bg-pickle/5"
              >
                <div className="font-display text-display-base font-bold text-white">
                  {c.name}
                </div>
                <div className="mt-0.5 text-sm text-white/60">
                  {c.city}, {c.state}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ============ Drill-down breadcrumbs
  const breadcrumb = (
    <div className="flex flex-wrap items-center gap-1 font-display text-display-xs uppercase font-semibold tracking-wide">
      <BreadButton
        active={step === "state"}
        onClick={() => {
          setStep("state");
          setPickedState(null);
          setPickedCity(null);
        }}
      >
        State
      </BreadButton>
      {pickedState && (
        <>
          <span className="text-white/30">›</span>
          <BreadButton
            active={step === "city"}
            onClick={() => {
              setStep("city");
              setPickedCity(null);
            }}
          >
            {pickedState}
          </BreadButton>
        </>
      )}
      {pickedCity && (
        <>
          <span className="text-white/30">›</span>
          <BreadButton active={step === "court"}>{pickedCity}</BreadButton>
        </>
      )}
      <button
        type="button"
        onClick={() => setStep("search")}
        className="ml-auto rounded-md border-2 border-white/30 px-2 py-0.5 text-white/60 hover:border-pickle hover:text-pickle"
      >
        Search
      </button>
    </div>
  );

  return (
    <div>
      {breadcrumb}

      {step === "state" && (
        <ul className="no-scrollbar mt-3 max-h-72 space-y-1 overflow-y-auto">
          {states.length === 0 && (
            <li className="rounded-lg border-2 border-white/20 p-4 text-center text-sm text-white/40">
              No active courts yet.
            </li>
          )}
          {states.map(({ state, count }) => (
            <li key={state}>
              <button
                type="button"
                onClick={() => {
                  setPickedState(state);
                  setStep("city");
                }}
                className="flex w-full items-center justify-between rounded-lg border-2 border-white/20 bg-black p-3 text-left transition hover:border-pickle hover:bg-pickle/5"
              >
                <span className="font-display text-display-lg font-extrabold text-white">
                  {state}
                </span>
                <span className="font-mono text-xs uppercase tracking-wider text-white/50">
                  {count} court{count === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === "city" && pickedState && (
        <ul className="no-scrollbar mt-3 max-h-72 space-y-1 overflow-y-auto">
          {cities.length === 0 && (
            <li className="rounded-lg border-2 border-white/20 p-4 text-center text-sm text-white/40">
              No cities in {pickedState}.
            </li>
          )}
          {cities.map(({ city, count }) => (
            <li key={city}>
              <button
                type="button"
                onClick={() => {
                  setPickedCity(city);
                  setStep("court");
                }}
                className="flex w-full items-center justify-between rounded-lg border-2 border-white/20 bg-black p-3 text-left transition hover:border-pickle hover:bg-pickle/5"
              >
                <span className="font-display text-display-base font-bold text-white">
                  {city}
                </span>
                <span className="font-mono text-xs uppercase tracking-wider text-white/50">
                  {count} court{count === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === "court" && pickedCity && (
        <ul className="no-scrollbar mt-3 max-h-72 space-y-1 overflow-y-auto">
          {cityCourts.length === 0 && (
            <li className="rounded-lg border-2 border-white/20 p-4 text-center text-sm text-white/40">
              No courts in {pickedCity}.
            </li>
          )}
          {cityCourts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange(c)}
                className="w-full rounded-lg border-2 border-white/20 bg-black p-3 text-left transition hover:border-pickle hover:bg-pickle/5"
              >
                <div className="font-display text-display-base font-bold text-white">
                  {c.name}
                </div>
                <div className="mt-0.5 text-sm text-white/60">
                  {c.city}, {c.state}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BreadButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  if (!onClick) {
    return (
      <span
        className={`rounded-md px-2 py-0.5 ${
          active ? "bg-pickle text-black" : "text-white/60"
        }`}
      >
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 transition ${
        active
          ? "bg-pickle text-black"
          : "text-white/60 hover:bg-white/10 hover:text-pickle"
      }`}
    >
      {children}
    </button>
  );
}
