"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBlockHard, cancelBlock } from "@/lib/play";

interface Props {
  blockId: string;
}

/**
 * Admin row actions for an open-play block:
 *   - "Delete" — hard removes the block + attendee rows (FK cascade)
 *   - "Cancel" — soft-deletes via status='cancelled' (kept for the
 *     cases where you want attendees to see the block was scrapped
 *     rather than disappearing without a trace)
 *
 * Admin RLS already permits both via the policies in migrations 0027/0028.
 */
export default function AdminBlockRow({ blockId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !confirm(
        "Delete this block permanently? Attendees + invites will be removed too.",
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      await deleteBlockHard(blockId);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        "Mark this block as cancelled? It stays on the calendar with a strikethrough.",
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      await cancelBlock(blockId);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="rounded-md border-2 border-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black disabled:opacity-50"
      >
        ✗ Delete
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={busy}
        className="rounded-md border border-white/30 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wide text-white/70 hover:border-pickle hover:text-pickle disabled:opacity-50"
      >
        Cancel
      </button>
      {err && <span className="text-[10px] text-bright">⚠ {err}</span>}
    </div>
  );
}
