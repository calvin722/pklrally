"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  matchId: string;
  status: string;
}

/**
 * Admin override actions for matches:
 *   - "Force vouch" — sets status='vouched', triggers stats apply
 *   - "Force cancel" — sets status='admin_deleted'
 *
 * Uses the admin RLS policy on matches (see migration 0002).
 */
export default function MatchRowActions({ matchId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setMatchStatus(next: string, alsoTimestamp = false) {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const update: Record<string, unknown> = { status: next };
    if (alsoTimestamp) update.vouched_at = new Date().toISOString();
    const { error } = await supabase
      .from("matches")
      .update(update)
      .eq("id", matchId);
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (status === "admin_deleted") {
    return (
      <span className="text-xs text-white/30">No actions</span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {status !== "vouched" && (
        <button
          type="button"
          onClick={() => setMatchStatus("vouched", true)}
          disabled={busy}
          className="rounded-md bg-pickle px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-black disabled:opacity-50"
        >
          ✓ Force vouch
        </button>
      )}
      {status !== "admin_deleted" && (
        <button
          type="button"
          onClick={() => setMatchStatus("admin_deleted")}
          disabled={busy}
          className="rounded-md border border-bright px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black disabled:opacity-50"
        >
          ✗ Cancel
        </button>
      )}
      {err && <span className="text-[10px] text-bright">⚠ {err}</span>}
    </div>
  );
}
