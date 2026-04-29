"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  playerId: string;
  displayName: string;
  isAdmin: boolean;
  isYou: boolean;
  alreadyDeleted: boolean;
}

/**
 * Admin row actions for /admin/players. The "Delete" button calls
 * admin_delete_player() (migration 0020), which anonymizes the player
 * row + nukes their auth login. Match history stays intact.
 *
 * Confirmation requires typing the player's display name to prevent
 * fat-fingering on a busy admin table.
 */
export default function AdminPlayerActions({
  playerId,
  displayName,
  isAdmin,
  isYou,
  alreadyDeleted,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm">("idle");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Disabled states
  if (alreadyDeleted) {
    return <span className="text-xs text-white/30">Deleted</span>;
  }
  if (isYou) {
    return (
      <span className="text-xs text-white/30" title="Use /settings to delete your own account">
        (You)
      </span>
    );
  }
  if (isAdmin) {
    return (
      <span
        className="text-xs text-white/30"
        title="Demote this admin first (toggle is_admin off in DB)"
      >
        Admin — demote first
      </span>
    );
  }

  async function handleDelete() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_player", {
      target_player_id: playerId,
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setStage("idle");
    setTyped("");
    setBusy(false);
    router.refresh();
  }

  if (stage === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStage("confirm")}
        className="rounded-md border border-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] leading-tight text-bright">
        Type{" "}
        <strong className="font-mono">
          {displayName}
        </strong>{" "}
        to confirm
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoFocus
        className="w-full rounded border-2 border-bright bg-black px-2 py-0.5 text-xs text-white"
      />
      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy || typed !== displayName}
          onClick={handleDelete}
          className="rounded border-2 border-bright bg-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-black disabled:opacity-30"
        >
          {busy ? "…" : "Delete forever"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setStage("idle");
            setTyped("");
            setErr(null);
          }}
          className="rounded border border-white/30 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white/70"
        >
          Cancel
        </button>
      </div>
      {err && <p className="text-[10px] text-bright">⚠ {err}</p>}
    </div>
  );
}
