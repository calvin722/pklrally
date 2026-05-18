"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * "How it works" explainer shown when a player taps "Start a Ladder League"
 * in the global dropdown menu. Walks through the King-of-the-Court
 * format + scoring + byes, then CTAs into the create form.
 */
export default function StartLeagueModal({ open, onClose }: Props) {
  const router = useRouter();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-league-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl overflow-y-auto rounded-2xl border-2 border-pickle bg-black p-6 text-white shadow-2xl md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/30 text-white/70 transition hover:border-bright hover:text-bright"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
          🏆 Ladder League
        </div>
        <h2
          id="start-league-title"
          className="mt-1 font-display text-display-2xl font-extrabold text-bright"
        >
          How it works
        </h2>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-white/85">
          <Section emoji="🎾" title="King of the Court">
            Players rotate across courts. Court 1 is the &ldquo;King court&rdquo; (top),
            Court 4 is the bottom. After every round, <strong>winners move up
            one court, losers move down one court.</strong>
          </Section>

          <Section emoji="🪑" title="Scheduled byes">
            More players than seats? No problem. Byes are on a fixed rotation
            so <strong>every player sits the same number of rounds.</strong> No
            getting stuck on the bench just because you had a rough game.
          </Section>

          <Section emoji="➕" title="Scoring: +10 win bonus">
            Each round, your team&rsquo;s game score plus a <strong>+10 bonus
            if you win</strong> is added to your total. Losers still earn their
            game score &mdash; so close losses count. Highest total at the end
            wins the league.
          </Section>

          <Section emoji="🔄" title="Fresh partners every round">
            Within each court the app picks the team split that <strong>avoids
            repeat partners</strong>, so you keep meeting and playing alongside
            new people.
          </Section>

          <Section emoji="⏱" title="A typical league">
            20 players · 4 courts · 10 rounds &asymp; 2 hours. Each player gets
            8 games and sits 2 byes. Everything is configurable when you set
            up the league.
          </Section>
        </div>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-2 border-white/30 px-6 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-white/70 transition hover:border-bright hover:text-bright"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/leagues/new");
            }}
            className="rounded-lg bg-pickle px-6 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-bright"
          >
            Create Ladder League →
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 text-2xl leading-none">{emoji}</div>
      <div>
        <div className="font-display text-display-sm font-bold text-pickle">
          {title}
        </div>
        <p className="mt-1 text-white/80">{children}</p>
      </div>
    </div>
  );
}
