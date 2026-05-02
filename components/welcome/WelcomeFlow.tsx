"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface WelcomeFlowProps {
  playerId: string;
  initialUsername: string | null;
  initialFirstName: string | null;
  initialLastName: string | null;
  initialNamePublic: boolean;
  initialDupr: number | null;
}

const TOTAL_STEPS = 5;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function WelcomeFlow({
  playerId,
  initialUsername,
  initialFirstName,
  initialLastName,
  initialNamePublic,
  initialDupr,
}: WelcomeFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState(0);

  // Form state
  const [username, setUsername] = useState(initialUsername ?? "");
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [namePublic, setNamePublic] = useState(initialNamePublic);
  const [rating, setRating] = useState<number>(initialDupr ?? 3.0);
  const [ratingAccepted, setRatingAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
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

  async function handleFinish() {
    if (!username.trim()) return setError("Please choose a username.");
    if (usernameStatus !== "available")
      return setError("That username is unavailable.");
    if (!firstName.trim()) return setError("Please enter your first name.");
    if (!lastName.trim()) return setError("Please enter your last name.");
    if (!ratingAccepted)
      return setError("Please confirm you understand the rating lock.");

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("players")
      .update({
        username: username.toLowerCase().trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        name_public: namePublic,
        dupr_self_rating: rating,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", playerId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
          Step {step + 1} / {TOTAL_STEPS}
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full transition ${
                i <= step ? "bg-pickle" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>

      {step === 0 && <FindOpenPlaySlide onNext={() => setStep(1)} />}
      {step === 1 && (
        <CreateOwnSlide onBack={() => setStep(0)} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <RecordGamesSlide onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && (
        <LocalPrizesSlide onBack={() => setStep(2)} onNext={() => setStep(4)} />
      )}
      {step === 4 && (
        <FormStep
          username={username}
          setUsername={(v) => setUsername(v.toLowerCase().replace(/\s+/g, ""))}
          usernameStatus={usernameStatus}
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          namePublic={namePublic}
          setNamePublic={setNamePublic}
          rating={rating}
          setRating={setRating}
          ratingAccepted={ratingAccepted}
          setRatingAccepted={setRatingAccepted}
          saving={saving}
          error={error}
          onBack={() => setStep(3)}
          onSubmit={handleFinish}
        />
      )}
    </div>
  );
}

// ----- slides -----

function FindOpenPlaySlide({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4">
      <span aria-hidden className="text-display-xl">📍</span>
      <h2 className="font-display text-display-2xl font-extrabold leading-tight text-bright">
        Find Open Play
      </h2>
      <p className="font-display text-display-xs uppercase font-bold tracking-widest text-electric">
        wherever you are
      </p>
      <p className="text-base text-white/80 leading-relaxed">
        Browse open-play sessions at any local court. See a 7-day calendar of
        what&apos;s happening, when, and who&apos;s going. Tap Join. Show up.
        Rotate in.
      </p>
      <div className="flex justify-end pt-2">
        <NextButton onClick={onNext}>Continue ▸</NextButton>
      </div>
    </div>
  );
}

function CreateOwnSlide({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <span aria-hidden className="text-display-xl">＋</span>
      <h2 className="font-display text-display-2xl font-extrabold leading-tight text-bright">
        Or Create Your Own
      </h2>
      <p className="font-display text-display-xs uppercase font-bold tracking-widest text-electric">
        and bring the crew
      </p>
      <p className="text-base text-white/80 leading-relaxed">
        Don&apos;t see a session at the right time? Schedule one in 10 seconds
        at any court. Invite friends by name, email, or text — they get a
        tap-to-confirm link.
      </p>
      <div className="rounded-xl border-2 border-electric/40 bg-electric/5 p-4 text-sm text-white/70 leading-relaxed">
        <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-electric">
          Bring the non-members
        </span>
        <p className="mt-1.5">
          Your friends don&apos;t need to download anything. Tap their text,
          confirm, done.
        </p>
      </div>
      <div className="flex items-center justify-between pt-2">
        <BackButton onClick={onBack} />
        <NextButton onClick={onNext}>Continue ▸</NextButton>
      </div>
    </div>
  );
}

function RecordGamesSlide({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <span aria-hidden className="text-display-xl">▶</span>
      <h2 className="font-display text-display-2xl font-extrabold leading-tight text-bright">
        Record Your Games
      </h2>
      <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
        every win counts
      </p>
      <p className="text-base text-white/80 leading-relaxed">
        After each match, log it on PKLRALLY. Your opponent vouches the score,
        and your stats start building. The more you play, the more your record
        speaks for itself.
      </p>
      <div className="flex items-center justify-between pt-2">
        <BackButton onClick={onBack} />
        <NextButton onClick={onNext}>Continue ▸</NextButton>
      </div>
    </div>
  );
}

function LocalPrizesSlide({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <span aria-hidden className="text-display-xl">🏆</span>
      <h2 className="font-display text-display-2xl font-extrabold leading-tight text-bright">
        Climb the Ladder for Local Prizes
      </h2>
      <p className="font-display text-display-xs uppercase font-bold tracking-widest text-bright">
        every month, in every city
      </p>
      <p className="text-base text-white/80 leading-relaxed">
        Each city runs its own monthly ladder. Climb it for a shot at prizes
        from local businesses — gear, gift cards, swag from sponsors who care
        about pickleball where you play.
      </p>
      <p className="text-base text-pickle font-semibold">
        Always free for players.
      </p>
      <div className="flex items-center justify-between pt-2">
        <BackButton onClick={onBack} />
        <NextButton onClick={onNext}>Let&apos;s set you up ▸</NextButton>
      </div>
    </div>
  );
}

interface FormStepProps {
  username: string;
  setUsername: (s: string) => void;
  usernameStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  firstName: string;
  setFirstName: (s: string) => void;
  lastName: string;
  setLastName: (s: string) => void;
  namePublic: boolean;
  setNamePublic: (b: boolean) => void;
  rating: number;
  setRating: (n: number) => void;
  ratingAccepted: boolean;
  setRatingAccepted: (b: boolean) => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

function FormStep({
  username,
  setUsername,
  usernameStatus,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  namePublic,
  setNamePublic,
  rating,
  setRating,
  ratingAccepted,
  setRatingAccepted,
  saving,
  error,
  onBack,
  onSubmit,
}: FormStepProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5"
    >
      <h2 className="font-display text-display-xl font-extrabold leading-tight text-bright">
        Set up your profile
      </h2>
      <p className="text-base text-white/60">
        Pick a username and add your name. You can adjust everything later from
        your profile.
      </p>

      {/* Username */}
      <label className="block">
        <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
          Username
        </span>
        <div className="relative mt-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={20}
            placeholder="e.g. calvin722"
            className="block w-full rounded-lg border-2 border-white bg-black px-4 py-3 pr-32 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
          />
          <UsernameStatusBadge status={usernameStatus} />
        </div>
        <p className="mt-1.5 text-xs text-white/50 leading-relaxed">
          3–20 characters, lowercase letters, numbers, or underscores only.
        </p>
      </label>

      {/* First / Last name */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            First name
          </span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={40}
            placeholder="Calvin"
            className="mt-2 block w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Last name
          </span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            maxLength={40}
            placeholder="Branch"
            className="mt-2 block w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
          />
        </label>
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
            When on, others see your real name (e.g. "Calvin Branch") in
            matches, leaderboards, and your profile. When off, only your
            username is shown.
          </p>
        </div>
      </label>

      {/* Self-rating */}
      <label className="block">
        <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
          Self-rating ({rating.toFixed(2)})
        </span>
        <input
          type="range"
          min={2.0}
          max={8.0}
          step={0.25}
          value={rating}
          onChange={(e) => setRating(parseFloat(e.target.value))}
          className="mt-2 w-full accent-pickle"
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
      </label>

      {/* Rating-lock acknowledgment */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-pickle/40 bg-pickle/5 p-3">
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

      <div className="flex items-center justify-between gap-3 pt-2">
        <BackButton onClick={onBack} />
        <button
          type="submit"
          disabled={saving || usernameStatus !== "available"}
          className="soft-stamp rounded-xl bg-pickle px-6 py-3 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
        >
          {saving ? "Saving..." : "Let's play ▸"}
        </button>
      </div>

      {error && <p className="text-base text-bright">⚠ {error}</p>}
    </form>
  );
}

// ----- atoms -----

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
    invalid: { text: "invalid format", color: "text-bright" },
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

function NextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="soft-stamp rounded-xl bg-pickle px-6 py-3 font-display text-display-base font-extrabold uppercase tracking-wide text-black"
    >
      {children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
    >
      ◀ Back
    </button>
  );
}
