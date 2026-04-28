"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProfileEditorProps {
  playerId: string;
  initialDisplayName: string;
  initialDupr: number | null;
  initialCity: string | null;
  initialState: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const inputStyle =
  "w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

export default function ProfileEditor({
  playerId,
  initialDisplayName,
  initialDupr,
  initialCity,
  initialState,
}: ProfileEditorProps) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [dupr, setDupr] = useState<number>(initialDupr ?? 3.0);
  const [city, setCity] = useState(initialCity ?? "");
  const [stateCode, setStateCode] = useState(initialState ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("players")
      .update({
        display_name: displayName.trim(),
        dupr_self_rating: dupr,
        city: city.trim() || null,
        state: stateCode.trim().toUpperCase() || null,
      })
      .eq("id", playerId);

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }

    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-5">
      <Field label="Display name">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={40}
          className={inputStyle}
        />
      </Field>

      <Field label={`DUPR self-rating — ${dupr.toFixed(1)}`}>
        <input
          type="range"
          min={2.0}
          max={8.0}
          step={0.5}
          value={dupr}
          onChange={(e) => setDupr(parseFloat(e.target.value))}
          className="w-full accent-pickle"
        />
        <div className="mt-1 flex justify-between font-mono text-xs text-white/40">
          <span>2.0</span>
          <span>5.0</span>
          <span>8.0</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={64}
            placeholder="Naples"
            className={inputStyle}
          />
        </Field>
        <Field label="State">
          <input
            type="text"
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            maxLength={2}
            placeholder="FL"
            className={`${inputStyle} uppercase`}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="soft-stamp rounded-xl bg-pickle px-6 py-3 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        {status === "saved" && (
          <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            ✓ Saved
          </span>
        )}
        {status === "error" && error && (
          <span className="text-base text-bright">⚠ {error}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
