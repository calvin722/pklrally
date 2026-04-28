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

export default function CourtPicker({ selectedId, onChange }: CourtPickerProps) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
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

  const filtered = useMemo(() => {
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
            onClick={() => onChange(null)}
            className="rounded-lg border-2 border-white/40 px-3 py-1.5 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={loading ? "Loading courts..." : "Search by name or city"}
        disabled={loading}
        className="w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none disabled:opacity-50"
      />
      <ul className="no-scrollbar mt-3 max-h-72 space-y-1 overflow-y-auto">
        {filtered.length === 0 && !loading && (
          <li className="rounded-lg border-2 border-white/20 p-4 text-center text-sm text-white/40">
            No courts match "{search}". (Admins can add courts at /admin/courts/new.)
          </li>
        )}
        {filtered.map((c) => (
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
