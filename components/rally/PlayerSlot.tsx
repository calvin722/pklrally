"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlayers, type PlayerSlot as PlayerSlotData } from "@/lib/rally";

interface PlayerHit {
  id: string;
  display_name: string;
  is_guest: boolean;
  email: string | null;
}

interface PlayerSlotProps {
  /** Current slot value (filled or empty). */
  value: PlayerSlotData | null;
  /** Slot is the active editor — only one slot expanded at a time. */
  isActive: boolean;
  /** Called when user taps the slot. */
  onActivate: () => void;
  /** Called when user picks a player or adds a guest. */
  onPick: (slot: PlayerSlotData) => void;
  /** Called when user clears a filled slot. */
  onClear: () => void;
  /** Player IDs already used in other slots — filtered from search results. */
  excludeIds: string[];
  /** Show the active-server star. */
  isServer?: boolean;
  /** Color accent — top half is pickle (serving), bottom is electric. */
  accent: "pickle" | "electric";
}

export default function PlayerSlot({
  value,
  isActive,
  onActivate,
  onPick,
  onClear,
  excludeIds,
  isServer = false,
  accent,
}: PlayerSlotProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteContact, setInviteContact] = useState("");

  // Auto-detect whether the invite contact is an email or a phone.
  // - Looks like email if it contains @
  // - Looks like phone if it has 7+ digits (+ optional +/-/space punctuation)
  const inviteContactType = (() => {
    const v = inviteContact.trim();
    if (!v) return "empty" as const;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email" as const;
    const digits = v.replace(/[^\d]/g, "");
    if (digits.length >= 10) return "phone" as const;
    return "invalid" as const;
  })();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchPlayers(query);
      setHits(results.filter((r) => !excludeIds.includes(r.id)));
      setSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, excludeIds]);

  // Auto-focus the search input when activated
  useEffect(() => {
    if (isActive && !value && inputRef.current) inputRef.current.focus();
  }, [isActive, value]);

  const accentBorder =
    accent === "pickle" ? "border-pickle" : "border-electric";
  const accentText = accent === "pickle" ? "text-pickle" : "text-electric";
  const accentDimBorder =
    accent === "pickle" ? "border-pickle/40" : "border-electric/40";

  // The court-cell button — always rendered. Reflects the slot's state
  // (filled or empty). When tapped, opens the search/invite editor as a
  // bottom-sheet overlay (rendered separately at the end of this fn).
  const slotButton = value ? (
    <button
      type="button"
      onClick={onActivate}
      className={`relative w-full rounded-xl border-2 ${
        isActive ? "border-bright" : accentBorder
      } ${isServer ? "neon-pickle" : ""} bg-black p-3 text-left transition hover:border-white`}
    >
      {isServer && (
        <span className="absolute -top-2 left-3 rounded-full bg-pickle px-2 py-0.5 font-display text-[10px] font-extrabold uppercase tracking-wider text-black">
          ★ Server
        </span>
      )}
      <div
        className={`font-display text-display-base font-bold ${
          value.kind === "me" ? "text-pickle" : "text-white"
        } truncate`}
      >
        {value.displayName}
      </div>
      <div className={`mt-1 text-xs ${accentText} font-semibold uppercase tracking-wide`}>
        {value.kind === "me" ? "You" : value.kind === "guest" ? "Guest" : "Member"}
      </div>
      <span
        className="absolute right-2 top-2 rounded-md border border-white/30 px-1.5 py-0.5 text-[10px] text-white/50 hover:border-white hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
      >
        ✕
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={onActivate}
      className={`relative w-full rounded-xl border-2 border-dashed ${
        isActive ? "border-bright" : accentDimBorder
      } bg-black p-3 text-left transition hover:border-solid hover:${accentBorder}`}
    >
      {isServer && (
        <span className="absolute -top-2 left-3 rounded-full bg-pickle px-2 py-0.5 font-display text-[10px] font-extrabold uppercase tracking-wider text-black">
          ★ Server
        </span>
      )}
      <div className={`font-display text-display-sm font-bold ${
        isActive ? "text-bright" : accentText
      } uppercase tracking-wide`}>
        {isActive ? "Editing…" : "+ Tap to add"}
      </div>
      <div className="mt-1 text-xs text-white/40">
        {isActive ? "See sheet below" : "Search or invite a guest"}
      </div>
    </button>
  );

  // If not active, just the button.
  if (!isActive) return slotButton;

  // Active — render the court-cell button AND a fixed bottom-sheet
  // overlay containing the search/invite editor. The overlay escapes
  // the court canvas's grid cells so the email/phone input has full
  // viewport width on mobile.
  return (
    <>
      {slotButton}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onActivate}
        aria-hidden
      />
      {/* Bottom sheet on mobile, centered modal on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t-2 border-x-2 ${accentBorder} bg-black p-5 shadow-2xl
          sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-2`}
      >
        {/* Header with close */}
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            {value ? "Replace player" : "Add player"}
          </p>
          <button
            type="button"
            onClick={onActivate}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 font-mono text-base text-white/60 hover:border-pickle hover:text-pickle"
          >
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name..."
          className="w-full rounded-lg border-2 border-white/30 bg-black px-3 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
        />

      {searching && <p className="mt-2 text-xs text-white/40">Searching...</p>}

      {hits.length > 0 && (
        <ul className="no-scrollbar mt-2 max-h-40 space-y-1 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() =>
                  onPick({
                    kind: h.is_guest ? "guest" : "member",
                    playerId: h.id,
                    displayName: h.display_name,
                    email: h.email ?? undefined,
                  })
                }
                className="w-full rounded-lg border-2 border-white/20 px-3 py-2 text-left text-sm text-white transition hover:border-pickle hover:bg-pickle/10"
              >
                {h.display_name}
                {h.is_guest && (
                  <span className="ml-2 text-xs text-bright">guest</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !searching && hits.length === 0 && (
        <p className="mt-2 text-xs text-white/40">No matches.</p>
      )}

      {query.trim().length >= 2 && !inviteMode && (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() =>
              onPick({
                kind: "guest",
                displayName: query.trim(),
              })
            }
            className="block w-full text-left font-display text-display-xs uppercase font-semibold tracking-wide text-bright hover:text-pickle"
          >
            + Add &quot;{query.trim()}&quot; as guest
          </button>
          <button
            type="button"
            onClick={() => setInviteMode(true)}
            className="block w-full text-left font-display text-display-xs uppercase font-semibold tracking-wide text-pickle hover:text-bright"
          >
            ✉ Send invite (email or text)
          </button>
        </div>
      )}

      {inviteMode && (
        <div className="mt-3 space-y-2 rounded-lg border-2 border-pickle/40 bg-pickle/5 p-3">
          <p className="text-xs text-white/70">
            Email <span className="text-pickle">{query.trim()}</span> a claim
            link, or enter their phone and you&apos;ll get a button to text
            the link from your own phone after saving.
          </p>
          <input
            type="text"
            inputMode="email"
            value={inviteContact}
            onChange={(e) => setInviteContact(e.target.value)}
            placeholder="email@example.com or 555-123-4567"
            autoFocus
            className="w-full rounded-lg border-2 border-white/40 bg-black px-3 py-2 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
          />
          {inviteContactType === "phone" && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-pickle">
              ✓ Detected phone — you&apos;ll send the SMS yourself after save
            </p>
          )}
          {inviteContactType === "email" && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-pickle">
              ✓ Detected email — we&apos;ll send the invite for you
            </p>
          )}
          {inviteContactType === "invalid" && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-bright">
              Doesn&apos;t look like a valid email or phone yet
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={
                inviteContactType !== "email" &&
                inviteContactType !== "phone"
              }
              onClick={() => {
                const v = inviteContact.trim();
                onPick({
                  kind: "guest",
                  displayName: query.trim(),
                  email:
                    inviteContactType === "email" ? v : undefined,
                  phone:
                    inviteContactType === "phone" ? v : undefined,
                  sendInvite: true,
                });
                setInviteMode(false);
                setInviteContact("");
              }}
              className="rounded-lg bg-pickle px-3 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-black disabled:opacity-50"
            >
              Add &amp; invite
            </button>
            <button
              type="button"
              onClick={() => {
                setInviteMode(false);
                setInviteContact("");
              }}
              className="rounded-lg border-2 border-white/40 px-3 py-1.5 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
