"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "pklrally-welcome-seen";

/**
 * First-visit homepage popup. Brief 3-step explainer + a link to the
 * full /how-it-works page for anyone who wants the deep version.
 *
 * Gated by localStorage — once dismissed, never shows again on this
 * device. Anyone clearing local storage / on a new device sees it once.
 */
export default function WelcomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Brief delay so the page paints first
        const t = setTimeout(() => setOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch {
      /* localStorage unavailable — show by default to be safe */
      setOpen(true);
    }
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      onClick={(e) => {
        // Click backdrop = dismiss
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border-2 border-pickle bg-black p-6 shadow-2xl neon-pickle">
        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 font-mono text-base text-white/60 hover:border-pickle hover:text-pickle"
        >
          ×
        </button>

        <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          Welcome to
        </p>
        <h2
          id="welcome-title"
          className="mt-1 font-display text-display-2xl font-extrabold uppercase tracking-tight text-bright"
        >
          PKL<span className="text-pickle">RALLY</span>
        </h2>
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-white/60">
          Play, Track &amp; Win
        </p>

        <ol className="mt-5 space-y-3">
          <Step
            n="1"
            title="Play your matches"
            body="At your local courts. Doubles, with anyone, on your own pace."
          />
          <Step
            n="2"
            title="Record your games"
            body="Log them on PKLRALLY after each rally. Your opponent vouches the score and it counts."
          />
          <Step
            n="3"
            title="Win prizes monthly"
            body="The top three on your city's ladder at the end of each month win sponsor prizes. Free for players."
          />
        </ol>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-lg bg-pickle px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:opacity-90"
          >
            Got it — let&apos;s play
          </button>
          <Link
            href="/how-it-works"
            onClick={dismiss}
            className="rounded-lg border-2 border-pickle px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black"
          >
            How scoring works →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-pickle bg-black font-mono text-sm font-bold text-pickle">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-white/80">{body}</p>
      </div>
    </li>
  );
}
