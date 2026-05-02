"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { searchPlayers } from "@/lib/rally";
import { inviteExistingPlayer, inviteNonMember } from "@/lib/play";

interface PlayerHit {
  id: string;
  display_name: string;
  is_guest: boolean;
  email: string | null;
}

interface JustInvited {
  playerId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  claimUrl: string | null;
}

interface Props {
  blockId: string;
  inviterPlayerId: string;
  inviterName: string;
  blockTimeRange: string;
  blockDayLabel: string;
  courtName: string;
  excludePlayerIds: string[];
  onClose: () => void;
  onInvited: () => void;
}

/**
 * Sheet for adding people to an open-play block. Three paths:
 *   1. Pick an existing PKLRALLY member from the typeahead → added directly
 *   2. Type an email for a non-member → guest row created, email invite fired
 *   3. Type a phone for a non-member → guest row + click-to-text button shown
 *
 * Stays open after each invite so the inviter can quickly add multiple
 * friends. A running list at the top shows who's been added.
 */
export default function InviteToBlockSheet({
  blockId,
  inviterPlayerId,
  inviterName,
  blockTimeRange,
  blockDayLabel,
  courtName,
  excludePlayerIds,
  onClose,
  onInvited,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [contactMode, setContactMode] = useState(false);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justInvited, setJustInvited] = useState<JustInvited[]>([]);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const pathname = usePathname() ?? "/play";

  // Detect contact type
  const contactType = (() => {
    const v = contact.trim();
    if (!v) return "empty" as const;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email" as const;
    const digits = v.replace(/[^\d]/g, "");
    if (digits.length >= 10) return "phone" as const;
    return "invalid" as const;
  })();

  // Typeahead
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2 || contactMode) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const results = await searchPlayers(query);
      setHits(
        results.filter(
          (r) =>
            !excludePlayerIds.includes(r.id) &&
            !justInvited.some((j) => j.playerId === r.id),
        ),
      );
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, contactMode, excludePlayerIds, justInvited]);

  useEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  async function fireBlockEmailInvite(invitedPlayerId: string) {
    fetch("/api/invite/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId, guestPlayerId: invitedPlayerId }),
    }).catch((e) => {
      console.error("Block email invite failed:", e);
    });
  }

  async function pickExisting(p: PlayerHit) {
    setBusy(true);
    setErr(null);
    try {
      await inviteExistingPlayer(blockId, p.id, inviterPlayerId);
      // Fire email notification for ANY recipient with an email — both
      // members (who otherwise have no signal they were invited) and
      // existing guests with email.
      if (p.email) {
        await fireBlockEmailInvite(p.id);
      }
      setJustInvited((prev) => [
        ...prev,
        {
          playerId: p.id,
          displayName: p.display_name,
          email: p.email,
          phone: null,
          claimUrl: null,
        },
      ]);
      setQuery("");
      setHits([]);
      onInvited();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function inviteNew() {
    setBusy(true);
    setErr(null);
    try {
      const name = query.trim();
      if (!name) throw new Error("Type a name first");

      const v = contact.trim();
      const result = await inviteNonMember({
        blockId,
        invitedByPlayerId: inviterPlayerId,
        displayName: name,
        email: contactType === "email" ? v : undefined,
        phone: contactType === "phone" ? v : undefined,
      });

      // For email invites, fire the email automatically
      if (contactType === "email") {
        await fireBlockEmailInvite(result.playerId);
      }

      setJustInvited((prev) => [
        ...prev,
        {
          playerId: result.playerId,
          displayName: name,
          email: result.email,
          phone: result.phone,
          claimUrl: result.claimUrl,
        },
      ]);
      setQuery("");
      setContact("");
      setContactMode(false);
      setHits([]);
      onInvited();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  }

  function buildSmsHref(invite: JustInvited): string {
    if (!invite.phone || !invite.claimUrl) return "#";
    // Append ?next=<this court page> so the recipient lands directly on
    // the block after signing in, not on the home page.
    const url = new URL(invite.claimUrl);
    url.searchParams.set("next", pathname);
    const body = `Hey ${invite.displayName}, ${inviterName} invited you to open play at ${courtName} ${blockDayLabel} ${blockTimeRange}. Tap to confirm + claim your stats: ${url.toString()}`;
    return `sms:${invite.phone}?&body=${encodeURIComponent(body)}`;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t-2 border-x-2 border-electric bg-black p-5 shadow-2xl
          sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-2"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-display-base font-extrabold uppercase tracking-tight text-electric">
            Invite friends
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 font-mono text-base text-white/60 hover:border-electric hover:text-electric"
          >
            ×
          </button>
        </div>

        <p className="mb-4 text-xs text-white/60">
          {blockDayLabel} · {blockTimeRange} · {courtName}
        </p>

        {/* Just-invited list with click-to-text buttons for phone invites */}
        {justInvited.length > 0 && (
          <div className="mb-4 rounded-lg border-2 border-pickle/40 bg-pickle/5 p-3">
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              ✓ Invited ({justInvited.length})
            </p>
            <ul className="mt-2 space-y-2">
              {justInvited.map((inv) => (
                <li
                  key={inv.playerId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-sm text-white">
                    {inv.displayName}
                    {inv.email && (
                      <span className="ml-2 font-mono text-xs text-white/50">
                        emailed
                      </span>
                    )}
                  </span>
                  {inv.phone && inv.claimUrl && (
                    <a
                      href={buildSmsHref(inv)}
                      className="rounded-md bg-electric px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-black hover:opacity-90"
                    >
                      Text {inv.displayName.split(" ")[0]}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!contactMode ? (
          <>
            {/* Search by name */}
            <label className="block">
              <span className="font-display text-display-xs uppercase font-bold tracking-wide text-electric">
                Search a friend
              </span>
              <input
                ref={queryInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing a name..."
                className="mt-2 w-full rounded-lg border-2 border-white/30 bg-black px-3 py-3 text-base text-white placeholder:text-white/40 focus:border-electric focus:outline-none"
              />
            </label>

            {searching && (
              <p className="mt-2 text-xs text-white/40">Searching…</p>
            )}

            {hits.length > 0 && (
              <ul className="mt-2 space-y-1">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => pickExisting(h)}
                      disabled={busy}
                      className="w-full rounded-lg border-2 border-white/20 px-3 py-2 text-left text-sm text-white transition hover:border-electric hover:bg-electric/10 disabled:opacity-50"
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
              <p className="mt-2 text-xs text-white/40">
                No matches in PKLRALLY for &quot;{query.trim()}&quot;.
              </p>
            )}

            {query.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => setContactMode(true)}
                className="mt-3 block w-full text-left font-display text-display-xs uppercase font-semibold tracking-wide text-electric hover:text-bright"
              >
                ✉ Invite {query.trim()} by email or text
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-white">
                Inviting <span className="text-electric">{query.trim()}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setContactMode(false);
                  setContact("");
                }}
                className="font-display text-display-xs uppercase font-bold tracking-wide text-white/60 hover:text-electric"
              >
                ← Back
              </button>
            </div>
            <label className="block">
              <span className="font-display text-display-xs uppercase font-bold tracking-wide text-electric">
                Email or phone
              </span>
              <input
                type="text"
                inputMode="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="email@example.com or 555-123-4567"
                autoFocus
                className="mt-2 w-full rounded-lg border-2 border-white/30 bg-black px-3 py-3 text-base text-white placeholder:text-white/40 focus:border-electric focus:outline-none"
              />
            </label>
            {contactType === "phone" && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-electric">
                ✓ Detected phone — you&apos;ll text them yourself after
              </p>
            )}
            {contactType === "email" && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-electric">
                ✓ Detected email — we&apos;ll send the invite for you
              </p>
            )}
            {contactType === "invalid" && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-bright">
                Doesn&apos;t look valid yet
              </p>
            )}

            <button
              type="button"
              disabled={
                busy ||
                (contactType !== "email" && contactType !== "phone")
              }
              onClick={inviteNew}
              className="mt-3 w-full rounded-lg bg-electric px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Adding…" : `Invite ${query.trim()}`}
            </button>
          </>
        )}

        {err && <p className="mt-3 text-sm text-bright">⚠ {err}</p>}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border-2 border-white/30 px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-white/70 hover:border-electric hover:text-electric"
        >
          Done
        </button>
      </div>
    </>
  );
}
