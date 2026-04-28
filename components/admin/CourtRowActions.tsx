"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface CourtRowActionsProps {
  courtId: string;
  status: string;
}

/**
 * Inline approve / reject buttons for pending_review courts on the admin
 * courts list. Other statuses get a small "•••" menu (just delete for now).
 */
export default function CourtRowActions({
  courtId,
  status,
}: CourtRowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(next: "active" | "inactive") {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("courts")
      .update({ status: next })
      .eq("id", courtId);
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (status === "pending_review") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStatus("active")}
          disabled={busy}
          className="rounded-lg bg-pickle px-3 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:bg-pickle-dim disabled:opacity-50"
        >
          ✓ Approve
        </button>
        <button
          type="button"
          onClick={() => setStatus("inactive")}
          disabled={busy}
          className="rounded-lg border-2 border-bright px-3 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black disabled:opacity-50"
        >
          ✗ Reject
        </button>
        {err && <span className="text-xs text-bright">⚠ {err}</span>}
      </div>
    );
  }

  if (status === "active") {
    return (
      <button
        type="button"
        onClick={() => setStatus("inactive")}
        disabled={busy}
        className="rounded-lg border-2 border-white/30 px-3 py-1.5 font-display text-display-xs font-semibold uppercase tracking-wide text-white/60 hover:border-bright hover:text-bright disabled:opacity-50"
      >
        Disable
      </button>
    );
  }

  if (status === "inactive") {
    return (
      <button
        type="button"
        onClick={() => setStatus("active")}
        disabled={busy}
        className="rounded-lg border-2 border-pickle/60 px-3 py-1.5 font-display text-display-xs font-semibold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black disabled:opacity-50"
      >
        Re-enable
      </button>
    );
  }

  return null;
}
