"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProfileEditorProps {
  playerId: string;
  initialUsername: string | null;
  initialFirstName: string | null;
  initialLastName: string | null;
  initialNamePublic: boolean;
  initialDupr: number | null;
  initialDuprChangedAt?: string | null;
  initialCity: string | null;
  initialState: string | null;
}

/**
 * True if the rating was last changed within the current calendar month
 * (UTC). Matches the server-side trigger logic from migration 0023.
 */
function isRatingLockedThisMonth(changedAt: string | null | undefined): boolean {
  if (!changedAt) return false;
  const d = new Date(changedAt);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

function nextMonthFirstLabel(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return next.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const inputStyle =
  "w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

export default function ProfileEditor({
  playerId,
  initialUsername,
  initialFirstName,
  initialLastName,
  initialNamePublic,
  initialDupr,
  initialDuprChangedAt,
  initialCity,
  initialState,
}: ProfileEditorProps) {
  const router = useRouter();

  const [username, setUsernameRaw] = useState(initialUsername ?? "");
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [namePublic, setNamePublic] = useState(initialNamePublic);
  const [rating, setRating] = useState<number>(initialDupr ?? 3.0);
  const [city, setCity] = useState(initialCity ?? "");
  const [stateCode, setStateCode] = useState(initialState ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Rating lock state
  const ratingLocked = isRatingLockedThisMonth(initialDuprChangedAt);
  const ratingChanged = (initialDupr ?? null) !== rating;
  const [ratingAccepted, setRatingAccepted] = useState(false);

  const setUsername = (v: string) =>
    setUsernameRaw(v.toLowerCase().replace(/\s+/g, ""));

  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >(initialUsername ? "available" : "idle");
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    if (!username) {
      setUsernameStatus("idle");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setUsernameStatus("invalid");
      return;
    }
    if (username === initialUsername) {
      setUsernameStatus("available");
      return;
    }
    setUsernameStatus("checking");
    usernameDebounce.current = setTimeout(async () => {
      try {
        const url = `${SUPABASE_URL}/rest/v1/players?select=id&username=eq.${encodeURIComponent(username)}&limit=1`;
        const res = await fetch(url, {
          headers: { apikey: ANON_KEY, Accept: "application/json" },
        });
        const rows = await res.json();
        setUsernameStatus(
          Array.isArray(rows) && rows.length > 0 ? "taken" : "available",
        );
      } catch {
        setUsernameStatus("idle");
      }
    }, 350);
    return () => {
      if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    };
  }, [username, initialUsername]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (usernameStatus !== "available") {
      setError("Pick an available username before saving.");
      return;
    }
    if (ratingChanged && !ratingAccepted) {
      setError(
        "Please confirm you understand the rating lock before saving.",
      );
      return;
    }
    setStatus("saving");
    setError(null);

    const supabase = createClient();
    // Skip writing the rating field when it hasn't changed — avoids
    // tripping the monthly-lock trigger unnecessarily.
    const update: Record<string, unknown> = {
      username: username.toLowerCase().trim(),
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      name_public: namePublic,
      city: city.trim() || null,
      state: stateCode.trim().toUpperCase() || null,
    };
    if (ratingChanged) {
      update.dupr_self_rating = rating;
    }

    const { error } = await supabase
      .from("players")
      .update(update)
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
      {/* Username */}
      <Field label="Username">
        <div className="relative">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={20}
            placeholder="e.g. calvin722"
            className={`${inputStyle} pr-32`}
          />
          <UsernameStatusBadge status={usernameStatus} />
        </div>
        <p className="mt-1.5 text-xs text-white/50">
          3–20 chars, lowercase letters, numbers, or underscores only.
        </p>
      </Field>

      {/* First / Last name */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={40}
            className={inputStyle}
          />
        </Field>
        <Field label="Last name">
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={40}
            className={inputStyle}
          />
        </Field>
      </div>

      {/* Name privacy toggle */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-white/30 p-4">
        <input
          type="checkbox"
          checked={namePublic}
          onChange={(e) => setNamePublic(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-pickle"
        />
        <div>
          <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Display my name publicly
          </div>
          <p className="mt-1 text-sm text-white/60 leading-relaxed">
            When on, your real name shows in matches and leaderboards. When
            off, only your username is shown.
          </p>
        </div>
      </label>

      {/* Self-rating */}
      <Field label={`Self-rating (${rating.toFixed(2)})`}>
        <input
          type="range"
          min={2.0}
          max={8.0}
          step={0.25}
          value={rating}
          onChange={(e) => setRating(parseFloat(e.target.value))}
          disabled={ratingLocked}
          className="w-full accent-pickle disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between font-mono text-xs text-white/40">
          <span>2.0</span>
          <span>5.0</span>
          <span>8.0</span>
        </div>
        <p className="mt-2 text-xs text-white/50 leading-relaxed">
          2.0 = beginner · 3.0–4.0 = intermediate · 4.0–5.0 = advanced · 5.0+
          = elite.
        </p>

        {ratingLocked ? (
          <div className="mt-3 rounded-lg border-2 border-bright/40 bg-bright/5 p-3">
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-bright">
              Rating locked this month
            </p>
            <p className="mt-1 text-xs text-white/70 leading-relaxed">
              You changed your rating already this month. Ratings affect ladder
              math (the team-rating-gap weighting), so you can change them once
              per month. Next change available on{" "}
              <span className="text-pickle">{nextMonthFirstLabel()}</span>.
            </p>
          </div>
        ) : (
          ratingChanged && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border-2 border-pickle/40 bg-pickle/5 p-3">
              <input
                type="checkbox"
                checked={ratingAccepted}
                onChange={(e) => setRatingAccepted(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-pickle"
              />
              <span className="text-sm leading-relaxed text-white/85">
                I&apos;ve picked my rating accurately. I understand it{" "}
                <span className="font-bold text-pickle">cannot be changed</span>{" "}
                again until the 1st of next month, and that it directly affects
                ladder stats (a higher rating discounts your wins against
                lower-rated players).
              </span>
            </label>
          )
        )}
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
          disabled={status === "saving" || usernameStatus !== "available"}
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

function UsernameStatusBadge({
  status,
}: {
  status: "idle" | "checking" | "available" | "taken" | "invalid";
}) {
  if (status === "idle") return null;
  const messages = {
    checking: { text: "...", color: "text-white/40" },
    available: { text: "✓ available", color: "text-pickle" },
    taken: { text: "✗ taken", color: "text-bright" },
    invalid: { text: "invalid", color: "text-bright" },
  } as const;
  const m = messages[status];
  return (
    <span
      className={`absolute right-3 top-1/2 -translate-y-1/2 font-display text-xs font-semibold uppercase tracking-wide ${m.color}`}
    >
      {m.text}
    </span>
  );
}
