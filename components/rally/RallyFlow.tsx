"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CourtPicker from "./CourtPicker";
import CourtCanvas, { type SlotId } from "./CourtCanvas";
import {
  saveMatch,
  type PlayerSlot,
  type PendingSmsInvite,
} from "@/lib/rally";

interface Court {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface RallyFlowProps {
  me: { id: string; displayName: string };
  /** Pre-selected default court (last one this user logged at, if any). */
  defaultCourt?: Court | null;
}

export default function RallyFlow({ me, defaultCourt }: RallyFlowProps) {
  const router = useRouter();

  const meSlot: PlayerSlot = {
    kind: "me",
    playerId: me.id,
    displayName: me.displayName,
  };

  const [court, setCourt] = useState<Court | null>(defaultCourt ?? null);
  const [showCourtPicker, setShowCourtPicker] = useState(!defaultCourt);

  // Logger always starts at top-left (active server slot)
  const [serverP1, setServerP1] = useState<PlayerSlot | null>(meSlot);
  const [serverP2, setServerP2] = useState<PlayerSlot | null>(null);
  const [receiverP1, setReceiverP1] = useState<PlayerSlot | null>(null);
  const [receiverP2, setReceiverP2] = useState<PlayerSlot | null>(null);

  // Default both scores to 11 — typical winning score in pickleball.
  // User taps down from 11 on the losing team.
  const [serverScore, setServerScore] = useState(11);
  const [receiverScore, setReceiverScore] = useState(11);

  const [activeSlot, setActiveSlot] = useState<SlotId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [pendingSmsInvites, setPendingSmsInvites] = useState<PendingSmsInvite[]>(
    [],
  );

  const allSet = !!serverP1 && !!serverP2 && !!receiverP1 && !!receiverP2;
  // Need at least one team scored AND scores aren't equal (no ties in pickleball)
  const validScore =
    (serverScore > 0 || receiverScore > 0) && serverScore !== receiverScore;
  const canSave = !!court && allSet && validScore && !saving;

  const usedIds = [serverP1, serverP2, receiverP1, receiverP2]
    .map((s) => s?.playerId)
    .filter((id): id is string => !!id);

  function setSlot(slot: SlotId, value: PlayerSlot | null) {
    if (slot === "server_p1") setServerP1(value);
    if (slot === "server_p2") setServerP2(value);
    if (slot === "receiver_p1") setReceiverP1(value);
    if (slot === "receiver_p2") setReceiverP2(value);
    if (value) setActiveSlot(null); // collapse on successful pick
  }

  function setScore(team: "server" | "receiver", value: number) {
    if (team === "server") setServerScore(value);
    else setReceiverScore(value);
  }

  async function handleSave() {
    if (!canSave || !court) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveMatch({
        courtId: court.id,
        loggerPlayerId: me.id,
        serverP1: serverP1!,
        serverP2: serverP2!,
        receiverP1: receiverP1!,
        receiverP2: receiverP2!,
        serverScore,
        receiverScore,
      });

      // Fire invite emails for any guests flagged with sendInvite. We don't
      // block the redirect on these — log failures to console; user can still
      // resend from the match page later (Phase 5b).
      for (const invitee of result.pendingInvites) {
        fetch("/api/invite/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: result.matchId,
            guestPlayerId: invitee.playerId,
          }),
        }).catch((err) => {
          console.error("Invite send failed for", invitee.email, err);
        });
      }

      // If there are click-to-text SMS invites, hold the user on a
      // confirmation screen with "Text X her invite" buttons. Otherwise
      // redirect home immediately.
      if (result.pendingSmsInvites.length > 0) {
        setSavedMatchId(result.matchId);
        setPendingSmsInvites(result.pendingSmsInvites);
        setSaving(false);
        return;
      }

      router.push(`/?rally_saved=${result.matchId}&status=${result.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match.");
      setSaving(false);
    }
  }

  // Post-save SMS invite screen — replaces the form once saved if there
  // are click-to-text invites to send.
  if (savedMatchId && pendingSmsInvites.length > 0) {
    return (
      <SmsInviteSuccess
        invites={pendingSmsInvites}
        loggerName={me.displayName}
        onDone={() => {
          router.push(
            `/?rally_saved=${savedMatchId}&status=saved`,
          );
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Court selector — collapsed default-court chip with "Change" button */}
      {court && !showCourtPicker ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-pickle bg-black p-4">
          <div>
            <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
              Court
            </div>
            <div className="mt-1 font-display text-display-base font-bold text-white">
              {court.name}
            </div>
            <div className="text-sm text-white/60">
              {court.city}, {court.state}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCourtPicker(true)}
            className="rounded-lg border-2 border-white/40 px-4 py-2 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
          >
            Change
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Pick a court
          </div>
          <CourtPicker
            selectedId={court?.id ?? null}
            onChange={(c) => {
              setCourt(c);
              if (c) setShowCourtPicker(false);
            }}
          />
        </div>
      )}

      {/* Integrated court canvas with player slots + kitchen score inputs */}
      {court && (
        <CourtCanvas
          serverP1={serverP1}
          serverP2={serverP2}
          receiverP1={receiverP1}
          receiverP2={receiverP2}
          serverScore={serverScore}
          receiverScore={receiverScore}
          activeSlot={activeSlot}
          onActivateSlot={setActiveSlot}
          onSlotChange={setSlot}
          onScoreChange={setScore}
          excludeIds={usedIds}
        />
      )}

      {/* Save button */}
      {court && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="soft-stamp flex-1 rounded-xl bg-pickle px-8 py-4 font-display text-display-lg font-extrabold uppercase tracking-wide text-black disabled:opacity-40"
          >
            {saving ? "Saving rally..." : "Save rally"}
          </button>
          {error && <span className="text-base text-bright">⚠ {error}</span>}
          {!allSet && !error && (
            <span className="text-sm text-white/50">
              Fill all 4 player slots and enter a score to save.
            </span>
          )}
          {allSet && !validScore && !error && (
            <span className="text-sm text-white/50">
              Adjust the score — it can't be a tie.
            </span>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================
// Click-to-text invite success panel
// ============================================================

function SmsInviteSuccess({
  invites,
  loggerName,
  onDone,
}: {
  invites: PendingSmsInvite[];
  loggerName: string;
  onDone: () => void;
}) {
  const [textedIds, setTextedIds] = useState<Set<string>>(new Set());

  function buildSmsHref(invite: PendingSmsInvite): string {
    const body = `Hey ${invite.displayName}, ${loggerName} just logged a pickleball match with you on PKLRALLY. Tap to claim your stats: ${invite.claimUrl}`;
    // sms: URI — recipient as the phone, body in &body=
    return `sms:${invite.phone}?&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-pickle bg-black p-5 neon-pickle">
        <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          ✓ Rally saved
        </p>
        <h2 className="mt-1 font-display text-display-lg font-extrabold uppercase tracking-tight text-bright">
          Send your invites
        </h2>
        <p className="mt-2 text-sm text-white/70 leading-relaxed">
          Tap each button below — your phone will open Messages with the
          invite already typed. Just hit send. The text comes from{" "}
          <span className="text-pickle">your number</span>, so your friend
          knows it's really you.
        </p>
      </div>

      <ul className="space-y-3">
        {invites.map((inv) => {
          const texted = textedIds.has(inv.playerId);
          return (
            <li
              key={inv.playerId}
              className={`rounded-xl border-2 ${
                texted ? "border-white/20 bg-white/[0.02]" : "border-pickle bg-black"
              } p-4`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-display-base font-bold text-white truncate">
                    {inv.displayName}
                  </p>
                  <p className="font-mono text-xs text-white/60">{inv.phone}</p>
                </div>
                <a
                  href={buildSmsHref(inv)}
                  onClick={() => {
                    setTextedIds((prev) => {
                      const next = new Set(prev);
                      next.add(inv.playerId);
                      return next;
                    });
                  }}
                  className={`shrink-0 rounded-lg px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide ${
                    texted
                      ? "border-2 border-pickle text-pickle"
                      : "bg-pickle text-black hover:opacity-90"
                  }`}
                >
                  {texted ? "✓ Sent — text again" : `Text ${inv.displayName.split(" ")[0]}`}
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onDone}
        className="soft-stamp w-full rounded-xl bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black"
      >
        Done
      </button>

      <p className="text-center text-xs text-white/40">
        Texting from a desktop? Long-press the button to copy the link, or
        just paste{" "}
        <span className="font-mono text-white/60">{invites[0]?.claimUrl}</span>{" "}
        into any chat.
      </p>
    </div>
  );
}
