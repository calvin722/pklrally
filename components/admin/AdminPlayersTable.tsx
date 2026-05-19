"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import AdminPlayerActions from "./AdminPlayerActions";
import { createClient } from "@/lib/supabase/client";

interface PlayerRow {
  id: string;
  display_name: string;
  username: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  dupr_self_rating: number | string | null;
  is_admin: boolean;
  is_guest: boolean;
  claimed_at: string | null;
  onboarding_completed_at: string | null;
  matches_played: number | null;
  wins: number;
  losses: number;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  deleted_at: string | null;
  created_at: string;
}

interface Props {
  players: PlayerRow[];
  currentPlayerId: string | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client-side admin players table.
 *
 * Adds bulk-action capability to the original server-rendered table:
 *   • A checkbox column on each row (yourself + admin rows are not
 *     selectable — neither bulk action would do anything to them)
 *   • A select-all checkbox in the header, with indeterminate state
 *     when only some rows are selected
 *   • A sticky action bar that appears when 1+ rows are selected,
 *     surfacing:
 *       - 📧 Email Invite (N eligible) — fans out POST /api/invite/profile
 *       - 🗑 Delete (M) — fans out the admin_delete_player RPC
 *     Both prompt for confirmation before firing.
 *
 * Per-row actions in the Actions column still work as before.
 */
export default function AdminPlayersTable({ players, currentPlayerId }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    null | "delete" | "invite"
  >(null);

  // Selectable rows = everyone EXCEPT yourself and admins (admins are
  // protected from deletion per existing UI; bulk invite isn't useful
  // for them either since they're not guests).
  const selectable = useMemo(
    () =>
      players.filter(
        (p) => p.id !== currentPlayerId && !p.is_admin,
      ),
    [players, currentPlayerId],
  );

  const allSelectableIds = useMemo(
    () => new Set(selectable.map((p) => p.id)),
    [selectable],
  );

  const selectedCount = selected.size;
  const allSelected =
    selectable.length > 0 && selectable.every((p) => selected.has(p.id));
  const someSelected = selectedCount > 0 && !allSelected;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allSelectableIds));
    }
  }

  // ---- bulk action helpers ----
  const selectedPlayers = useMemo(
    () => players.filter((p) => selected.has(p.id)),
    [players, selected],
  );
  const eligibleForInvite = useMemo(
    () =>
      selectedPlayers.filter(
        (p) =>
          p.is_guest &&
          !p.claimed_at &&
          !p.deleted_at &&
          !!p.email &&
          EMAIL_RX.test(p.email),
      ),
    [selectedPlayers],
  );

  async function runBulkDelete() {
    setBusy(true);
    setProgress(`Deleting 0 / ${selectedCount}…`);
    const supabase = createClient();
    let done = 0;
    let failed = 0;
    for (const id of selected) {
      const { error } = await supabase.rpc("admin_delete_player", {
        target_player_id: id,
      });
      if (error) failed++;
      done++;
      setProgress(`Deleting ${done} / ${selectedCount}…`);
    }
    setProgress(
      `✓ Deleted ${done - failed}${failed > 0 ? ` (${failed} failed)` : ""}`,
    );
    setSelected(new Set());
    setBusy(false);
    setConfirmAction(null);
    router.refresh();
    setTimeout(() => setProgress(null), 4000);
  }

  async function runBulkInvite() {
    setBusy(true);
    const targets = eligibleForInvite;
    setProgress(`Sending 0 / ${targets.length}…`);
    let done = 0;
    let failed = 0;
    // Sequential to avoid hammering Resend; each call is fast (~200ms).
    for (const p of targets) {
      try {
        const res = await fetch("/api/invite/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: p.id }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      done++;
      setProgress(`Sending ${done} / ${targets.length}…`);
    }
    setProgress(
      `✓ Sent ${done - failed} invite${done - failed === 1 ? "" : "s"}${
        failed > 0 ? ` (${failed} failed)` : ""
      }`,
    );
    setSelected(new Set());
    setBusy(false);
    setConfirmAction(null);
    setTimeout(() => setProgress(null), 4000);
  }

  return (
    <>
      {/* Sticky action bar — only when any selected */}
      {selectedCount > 0 && (
        <div className="sticky top-4 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-pickle bg-pickle/15 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="font-display text-display-sm font-extrabold text-pickle">
              {selectedCount}
            </span>
            <span className="text-sm text-white">
              selected · {eligibleForInvite.length} eligible for invite
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-white/60 hover:text-bright"
            >
              clear
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmAction("invite")}
              disabled={busy || eligibleForInvite.length === 0}
              className="rounded-lg border-2 border-pickle px-3 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-pickle transition hover:bg-pickle hover:text-black disabled:opacity-40"
            >
              📧 Email Invite ({eligibleForInvite.length})
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("delete")}
              disabled={busy}
              className="rounded-lg border-2 border-bright px-3 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-bright transition hover:bg-bright hover:text-black disabled:opacity-40"
            >
              🗑 Delete ({selectedCount})
            </button>
          </div>
        </div>
      )}

      {progress && (
        <p className="mt-3 rounded-lg border border-pickle/40 bg-pickle/5 px-3 py-2 text-xs text-pickle">
          {progress}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-base">
          <thead className="bg-pickle text-black">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer accent-black"
                  aria-label="Select all"
                  disabled={selectable.length === 0}
                />
              </th>
              <Th>Player</Th>
              <Th>Email</Th>
              <Th>Location</Th>
              <Th>DUPR</Th>
              <Th>W / L</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/50">
                  No players match.
                </td>
              </tr>
            )}
            {players.map((p) => {
              const isSelectable = p.id !== currentPlayerId && !p.is_admin;
              const isChecked = selected.has(p.id);
              return (
                <tr
                  key={p.id}
                  className={`border-t-2 border-pickle/30 ${
                    isChecked ? "bg-pickle/5" : ""
                  }`}
                >
                  <td className="px-3 py-3 align-middle">
                    {isSelectable ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 cursor-pointer accent-pickle"
                        aria-label={`Select ${p.display_name}`}
                      />
                    ) : (
                      <span
                        className="text-xs text-white/20"
                        title={
                          p.is_admin
                            ? "Admins can't be bulk-deleted"
                            : "You can't bulk-delete yourself"
                        }
                      >
                        —
                      </span>
                    )}
                  </td>
                  <Td>
                    <Link
                      href={`/profile/${p.id}`}
                      className="flex items-center gap-2 hover:text-pickle"
                    >
                      <Avatar player={p} size="xs" />
                      <span>
                        <span className="font-medium">{p.display_name}</span>
                        {p.username && (
                          <span className="ml-1 text-xs text-white/50">
                            @{p.username}
                          </span>
                        )}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-sm text-white/70">
                      {p.email ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    {p.city || p.state ? (
                      <span className="text-sm text-white/70">
                        {[p.city, p.state].filter(Boolean).join(", ")}
                      </span>
                    ) : (
                      <span className="text-sm text-white/30">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-sm text-pickle">
                      {p.dupr_self_rating !== null
                        ? Number(p.dupr_self_rating).toFixed(2)
                        : "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-sm text-white/80">
                      {p.wins} / {p.losses}
                    </span>
                  </Td>
                  <Td>
                    <PlayerBadges player={p} />
                  </Td>
                  <Td>
                    <AdminPlayerActions
                      playerId={p.id}
                      displayName={p.display_name}
                      isAdmin={p.is_admin}
                      isYou={currentPlayerId === p.id}
                      alreadyDeleted={p.deleted_at !== null}
                      isGuest={p.is_guest}
                      email={p.email}
                      claimedAt={p.claimed_at}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction === "delete"
              ? `Delete ${selectedCount} player${selectedCount === 1 ? "" : "s"}?`
              : `Send profile invite to ${eligibleForInvite.length} guest${
                  eligibleForInvite.length === 1 ? "" : "s"
                }?`
          }
          body={
            confirmAction === "delete"
              ? "This anonymizes the player rows and removes their auth login. Their match history stays intact, but it cannot be undone."
              : `Eligible recipients are guest players with an email on file who haven't claimed their account yet. Of ${selectedCount} selected, ${
                  eligibleForInvite.length
                } will be emailed. The rest (members, claimed accounts, or no email) are skipped.`
          }
          ctaLabel={
            confirmAction === "delete"
              ? `Delete ${selectedCount} players`
              : `Send ${eligibleForInvite.length} invites`
          }
          ctaColor={confirmAction === "delete" ? "bright" : "pickle"}
          busy={busy}
          onConfirm={
            confirmAction === "delete" ? runBulkDelete : runBulkInvite
          }
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}

// =====================================================================
// Confirmation modal (shared between bulk actions)
// =====================================================================
function ConfirmModal({
  title,
  body,
  ctaLabel,
  ctaColor,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaColor: "bright" | "pickle";
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ctaCls =
    ctaColor === "bright"
      ? "bg-bright text-black hover:bg-pickle"
      : "bg-pickle text-black hover:bg-bright";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-md rounded-2xl border-2 ${
          ctaColor === "bright" ? "border-bright" : "border-pickle"
        } bg-black p-6 text-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-display-lg font-extrabold text-bright">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/85">{body}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border-2 border-white/40 px-5 py-2.5 font-display text-display-xs font-bold uppercase tracking-wide text-white/80 transition hover:border-white hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-5 py-2.5 font-display text-display-xs font-extrabold uppercase tracking-wide transition disabled:opacity-50 ${ctaCls}`}
          >
            {busy ? "Working…" : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PlayerBadges (moved here from the page for cohesion)
// =====================================================================
function PlayerBadges({ player }: { player: PlayerRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {player.is_admin && <Badge color="bright">Admin</Badge>}
      {player.is_guest && <Badge color="electric">Guest</Badge>}
      {player.claimed_at && <Badge color="pickle">Claimed</Badge>}
      {!player.is_guest && !player.onboarding_completed_at && (
        <Badge color="white">Pending onboarding</Badge>
      )}
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "pickle" | "electric" | "bright" | "white";
  children: React.ReactNode;
}) {
  const cls = {
    pickle: "border-pickle text-pickle",
    electric: "border-electric text-electric",
    bright: "border-bright text-bright",
    white: "border-white/40 text-white/60",
  }[color];
  return (
    <span
      className={`inline-block rounded-full border ${cls} px-2 py-0.5 font-display text-[10px] uppercase font-semibold tracking-wider`}
    >
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle text-white">{children}</td>;
}
