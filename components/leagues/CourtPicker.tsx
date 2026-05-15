"use client";

import { useEffect, useState } from "react";
import { fetchCourtsForPicker } from "@/lib/rally";

interface Court {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface Props {
  courtId: string | null;
  manualName: string;
  manualAddress: string;
  onChange: (v: {
    courtId: string | null;
    manualName: string;
    manualAddress: string;
  }) => void;
}

const inputStyle =
  "w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

export default function CourtPicker({
  courtId,
  manualName,
  manualAddress,
  onChange,
}: Props) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"select" | "manual">(
    manualName ? "manual" : "select",
  );

  useEffect(() => {
    fetchCourtsForPicker().then((data) => {
      setCourts(data);
      setLoading(false);
    });
  }, []);

  const selected = courts.find((c) => c.id === courtId);
  const filtered = query.trim()
    ? courts.filter((c) =>
        `${c.name} ${c.city} ${c.state}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : courts.slice(0, 8);

  function pick(id: string | null) {
    onChange({ courtId: id, manualName: "", manualAddress: "" });
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("select");
            onChange({ courtId, manualName: "", manualAddress: "" });
          }}
          className={`flex-1 rounded-lg border-2 px-3 py-2 text-left transition ${
            mode === "select"
              ? "border-pickle bg-pickle/10"
              : "border-white/30 hover:border-white"
          }`}
        >
          <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
            Pick from list
          </div>
          <div className="mt-0.5 text-xs text-white/60">Existing courts</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("manual");
            onChange({ courtId: null, manualName, manualAddress });
          }}
          className={`flex-1 rounded-lg border-2 px-3 py-2 text-left transition ${
            mode === "manual"
              ? "border-pickle bg-pickle/10"
              : "border-white/30 hover:border-white"
          }`}
        >
          <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
            Enter manually
          </div>
          <div className="mt-0.5 text-xs text-white/60">Court name + address</div>
        </button>
      </div>

      {mode === "select" && (
        <div className="space-y-2">
          {selected && (
            <div className="flex items-center justify-between rounded-lg border-2 border-pickle bg-pickle/10 px-3 py-2">
              <div>
                <div className="font-bold text-white">{selected.name}</div>
                <div className="text-xs text-white/60">
                  {selected.city}, {selected.state}
                </div>
              </div>
              <button
                type="button"
                onClick={() => pick(null)}
                className="text-xs text-bright hover:underline"
              >
                clear
              </button>
            </div>
          )}
          {!selected && (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={loading ? "Loading courts…" : "Search courts…"}
                disabled={loading}
                className={inputStyle}
              />
              {filtered.length > 0 ? (
                <ul className="max-h-56 divide-y divide-white/10 overflow-y-auto rounded-lg border-2 border-white/30 bg-black">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pick(c.id)}
                        className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-pickle/10"
                      >
                        <div className="font-bold">{c.name}</div>
                        <div className="text-xs text-white/50">
                          {c.city}, {c.state}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                !loading && (
                  <p className="text-xs text-white/50">
                    No matches.{" "}
                    <button
                      type="button"
                      className="text-pickle hover:underline"
                      onClick={() => setMode("manual")}
                    >
                      Enter manually instead?
                    </button>
                  </p>
                )
              )}
            </>
          )}
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-2">
          <input
            type="text"
            value={manualName}
            onChange={(e) =>
              onChange({ courtId: null, manualName: e.target.value, manualAddress })
            }
            placeholder="Court name (e.g. Cherry Creek Park Courts)"
            className={inputStyle}
          />
          <input
            type="text"
            value={manualAddress}
            onChange={(e) =>
              onChange({ courtId: null, manualName, manualAddress: e.target.value })
            }
            placeholder="Address (street, city, state)"
            className={inputStyle}
          />
        </div>
      )}
    </div>
  );
}
