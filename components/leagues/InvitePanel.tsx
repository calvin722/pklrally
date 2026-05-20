"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type LeagueInvite,
  createInvite,
  fetchInvites,
  removeInvitee,
  sendInviteEmail,
} from "@/lib/leagues";

interface Props {
  leagueId: string;
  invitedBy: string;
}

const inputStyle =
  "rounded-lg border-2 border-white bg-black px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

export default function InvitePanel({ leagueId, invitedBy }: Props) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [invites, setInvites] = useState<LeagueInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<LeagueInvite | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const list = await fetchInvites(leagueId);
    setInvites(list);
  }, [leagueId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function send() {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("Enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    setLastNote(null);
    try {
      const { id } = await createInvite({
        leagueId,
        email: e,
        phone: phone.trim() || undefined,
        invitedBy,
      });
      await sendInviteEmail({ leagueId, inviteId: id });
      setLastNote(`✓ Invite emailed to ${e}`);
      setEmail("");
      setPhone("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite");
    } finally {
      setBusy(false);
    }
  }

  async function resend(inv: LeagueInvite) {
    setBusy(true);
    setError(null);
    setLastNote(null);
    try {
      await sendInviteEmail({ leagueId, inviteId: inv.id });
      setLastNote(`✓ Re-sent to ${inv.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemoval) return;
    const inv = pendingRemoval;
    setBusy(true);
    setError(null);
    setLastNote(null);
    try {
      await removeInvitee({
        leagueId,
        inviteId: inv.id,
        playerId: inv.player_id ?? null,
      });
      setLastNote(`✓ Removed ${inv.email}`);
      setPendingRemoval(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    pending: invites.filter((i) => i.status === "pending").length,
    accepted: invites.filter((i) => i.status === "accepted").length,
    declined: invites.filter((i) => i.status === "declined").length,
  };

  return (
    <div className="rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-display-sm font-bold text-pickle">
            Invites
          </h3>
          <p className="mt-1 text-xs text-white/60">
            Send an email invite. Recipients see the league details + accept /
            decline buttons — no account required to RSVP.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Stat label="Joining" value={counts.accepted} color="text-pickle" />
          <Stat label="Pending" value={counts.pending} color="text-white/80" />
          <Stat label="Declined" value={counts.declined} color="text-white/40" />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@example.com"
          className={inputStyle}
          disabled={busy}
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className={inputStyle}
          disabled={busy}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !email.trim()}
          className="rounded-lg bg-pickle px-5 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black transition hover:bg-bright disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send Invite"}
        </button>
      </div>

      {lastNote && (
        <p className="mt-2 text-xs text-pickle">{lastNote}</p>
      )}
      {error && <p className="mt-2 text-xs text-bright">⚠ {error}</p>}

      {pendingRemoval && (
        <RemoveConfirmModal
          invite={pendingRemoval}
          busy={busy}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={confirmRemove}
        />
      )}

      {invites.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border-2 border-pickle/30">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-pickle/30 text-white">
              <tr>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
                <Th>Responded</Th>
                <Th>{""}</Th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-t-2 border-pickle/20">
                  <Td>
                    <span className="text-white">{inv.email}</span>
                    {inv.phone && (
                      <div className="text-xs text-white/50">{inv.phone}</div>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={inv.status} />
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-white/60">
                      {fmtDate(inv.created_at)}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-white/60">
                      {inv.responded_at ? fmtDate(inv.responded_at) : "—"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      {inv.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => resend(inv)}
                          disabled={busy}
                          className="text-xs text-pickle hover:underline disabled:opacity-50"
                        >
                          resend
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPendingRemoval(inv)}
                        disabled={busy}
                        className="text-xs text-bright hover:underline disabled:opacity-50"
                        title="Remove from league"
                      >
                        remove
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border-2 border-white/20 px-3 py-1.5 text-center">
      <div className={`font-display text-display-sm font-extrabold ${color}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-white/50">
        {label}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-white/10 text-white" },
    accepted: { label: "Joining", cls: "bg-pickle text-black" },
    declined: { label: "Declined", cls: "bg-white/10 text-white/40" },
  };
  const m = map[status] ?? map.pending;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-display text-display-xs uppercase font-bold tracking-wide">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}
function RemoveConfirmModal({
  invite,
  busy,
  onCancel,
  onConfirm,
}: {
  invite: LeagueInvite;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const statusLabel =
    invite.status === "accepted"
      ? "joining"
      : invite.status === "declined"
        ? "declined"
        : "pending";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-bright bg-black p-6">
        <h4 className="font-display text-display-base font-extrabold uppercase tracking-wide text-bright">
          Remove invitee?
        </h4>
        <p className="mt-3 text-sm text-white/80">
          This will permanently remove{" "}
          <span className="font-mono text-white">{invite.email}</span>{" "}
          (currently <span className="text-white/60">{statusLabel}</span>) from
          this league. They&rsquo;ll disappear from the invite list and roster.
        </p>
        {invite.status === "accepted" && (
          <p className="mt-3 rounded-lg border-2 border-bright/40 bg-bright/5 px-3 py-2 text-xs text-bright">
            ⚠ They&rsquo;ve already accepted. Any prior round scores stay
            intact, but they won&rsquo;t be paired into future rounds.
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border-2 border-white/20 px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-white/80 hover:border-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-lg bg-bright px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:bg-bright/90 disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
