"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type InviteStatus, respondToInvite } from "@/lib/leagues";

interface Props {
  token: string;
  autoAction: "accept" | "decline" | null;
  leagueId: string;
}

export default function RsvpClient({ token, autoAction, leagueId }: Props) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRan, setAutoRan] = useState(false);

  // Auto-fire when an action is supplied via the email link
  useEffect(() => {
    if (autoRan || !autoAction || status) return;
    setAutoRan(true);
    setBusy(true);
    respondToInvite({ token, action: autoAction })
      .then((res) => setStatus(res.status))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not process RSVP"),
      )
      .finally(() => setBusy(false));
  }, [autoAction, autoRan, status, token]);

  async function act(action: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await respondToInvite({
        token,
        action,
        displayName: name.trim() || undefined,
      });
      setStatus(res.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process RSVP");
    } finally {
      setBusy(false);
    }
  }

  if (status === "accepted") {
    return (
      <div className="mt-6 rounded-2xl border-2 border-pickle bg-pickle/10 p-5 text-center">
        <div className="text-3xl">✓</div>
        <div className="mt-2 font-display text-display-lg font-extrabold text-pickle">
          You&rsquo;re in!
        </div>
        <p className="mt-2 text-sm text-white/80">
          Your spot is locked. The organizer can see you on the roster.
        </p>
        <Link
          href={`/leagues/${leagueId}`}
          className="mt-4 inline-block rounded-lg border-2 border-pickle px-5 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black"
        >
          View the league →
        </Link>
      </div>
    );
  }
  if (status === "declined") {
    return (
      <div className="mt-6 rounded-2xl border-2 border-white/20 bg-white/5 p-5 text-center">
        <div className="text-white">Got it — you said you can&rsquo;t make this one.</div>
        <p className="mt-2 text-xs text-white/50">
          You can still come watch. Tell the organizer if your plans change.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div>
        <label className="block text-sm text-white/80">
          Your name (optional — helps the organizer recognize you)
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First Last"
            className="mt-1 w-full rounded-lg border-2 border-white bg-black px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
            disabled={busy}
          />
        </label>
      </div>

      {error && <p className="text-sm text-bright">⚠ {error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => act("accept")}
          disabled={busy}
          className="flex-1 rounded-lg bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black transition hover:bg-bright disabled:opacity-50"
        >
          {busy ? "…" : "✓ I'm in"}
        </button>
        <button
          type="button"
          onClick={() => act("decline")}
          disabled={busy}
          className="flex-1 rounded-lg border-2 border-white/40 px-6 py-4 font-display text-display-base font-bold uppercase tracking-wide text-white/80 transition hover:border-bright hover:text-bright disabled:opacity-50"
        >
          Can&rsquo;t make it
        </button>
      </div>
    </div>
  );
}
