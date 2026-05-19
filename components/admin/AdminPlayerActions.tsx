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
  /** Guest players with an email can be sent a "claim your profile" invite. */
  isGuest?: boolean;
  email?: string | null;
  claimedAt?: string | null;
}

/**
 * Admin row actions for /admin/players.
 *
 * Two actions, independently rendered:
 *   • "📧 Invite" — for guest players with an email who haven't claimed
 *     yet. Sends a one-tap claim email via /api/invite/profile.
 *   • "Delete" — calls admin_delete_player() (migration 0020), which
 *     anonymizes the player row + nukes their auth login. Match history
 *     stays intact. Confirmation requires typing the player's display
 *     name to prevent fat-fingering on a busy admin table.
 */
export default function AdminPlayerActions({
  playerId,
  displayName,
  isAdmin,
  isYou,
  alreadyDeleted,
  isGuest = false,
  email = null,
  claimedAt = null,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm">("idle");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Profile-invite state (independent of delete flow)
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const canSendInvite =
    isGuest &&
    !claimedAt &&
    !alreadyDeleted &&
    !!email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function sendProfileInvite() {
    setInviteBusy(true);
    setInviteNote(null);
    try {
      const res = await fetch("/api/invite/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setInviteNote(`✓ Emailed to ${json.sentTo}`);
    } catch (e) {
      setInviteNote(e instanceof Error ? `⚠ ${e.message}` : "Send failed");
    } finally {
      setInviteBusy(false);
    }
  }

  // -------- early-return states (no buttons) --------
  if (alreadyDeleted) {
    return <span className="text-xs text-white/30">Deleted</span>;
  }
  if (isYou) {
    return (
      <span
        className="text-xs text-white/30"
        title="Use /settings to delete your own account"
      >
        (You)
      </span>
    );
  }

  // Admins: only allow the profile-invite path; deletion is blocked.
  // (In practice admins won't be guests, but keep the code defensive.)
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
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          {canSendInvite && (
            <button
              type="button"
              onClick={sendProfileInvite}
              disabled={inviteBusy}
              className="rounded-md border border-pickle px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black disabled:opacity-50"
              title={`Email ${email} to claim profile + set DUPR`}
            >
              {inviteBusy ? "…" : "📧 Invite"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setStage("confirm")}
            className="rounded-md border border-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black"
          >
            Delete
          </button>
        </div>
        {inviteNote && (
          <p className="text-[10px] text-pickle">{inviteNote}</p>
        )}
      </div>
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
