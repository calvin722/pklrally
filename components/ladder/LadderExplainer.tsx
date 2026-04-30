"use client";

import { useState } from "react";

interface Props {
  children: React.ReactNode;
}

/**
 * Collapsible "How the ranking works" wrapper. Default state is closed —
 * just shows the heading and a + button. Click to expand the full
 * explainer (formula, reasoning, examples). Server-rendered children
 * are passed in so we don't have to duplicate the explainer markup
 * client-side.
 */
export default function LadderExplainer({ children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mx-auto mt-8 max-w-3xl rounded-2xl border-2 border-white/15 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.04]"
      >
        <h2 className="font-display text-display-sm font-extrabold uppercase tracking-wide text-pickle">
          How the ranking works
        </h2>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-pickle font-mono text-display-base font-bold leading-none text-pickle"
          aria-hidden
        >
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="border-t-2 border-white/10 px-5 pb-5 pt-4">{children}</div>}
    </section>
  );
}
