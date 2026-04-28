"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CourtPicker from "./CourtPicker";
import CourtCanvas, { type SlotId } from "./CourtCanvas";
import { saveMatch, type PlayerSlot } from "@/lib/rally";

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
      router.push(`/?rally_saved=${result.matchId}&status=${result.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save match.");
      setSaving(false);
    }
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
