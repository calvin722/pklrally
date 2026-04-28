"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { vouchMatch, disputeMatch, type MatchSummary } from "@/lib/matches";

interface MatchCardProps {
  match: MatchSummary;
  /** The current viewer — used to determine if vouch/dispute buttons show */
  viewerPlayerId: string | null;
  /** Compact = no vouch buttons, just the summary. Used in city timeline. */
  compact?: boolean;
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "Pending vouch", color: "text-bright" },
  vouched: { text: "Vouched", color: "text-pickle" },
  disputed: { text: "Disputed", color: "text-electric" },
  unverified_all_guest: { text: "Unverified", color: "text-white/50" },
  admin_deleted: { text: "Removed", color: "text-white/30" },
};

export default function MatchCard({
  match,
  viewerPlayerId,
  compact = false,
}: MatchCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverWon = match.server_score > match.receiver_score;
  const status = STATUS_LABEL[match.status] ?? STATUS_LABEL.pending;

  // Is the viewer on the opposing team from the logger?
  const loggerOnServing =
    match.logged_by === match.server_team_p1?.id ||
    match.logged_by === match.server_team_p2?.id;
  const viewerOnServing =
    viewerPlayerId &&
    (viewerPlayerId === match.server_team_p1?.id ||
      viewerPlayerId === match.server_team_p2?.id);
  const viewerOnReceiving =
    viewerPlayerId &&
    (viewerPlayerId === match.receiver_team_p1?.id ||
      viewerPlayerId === match.receiver_team_p2?.id);
  const viewerCanVouch =
    !compact &&
    match.status === "pending" &&
    viewerPlayerId &&
    viewerPlayerId !== match.logged_by &&
    ((loggerOnServing && viewerOnReceiving) ||
      (!loggerOnServing && viewerOnServing));

  async function handleAction(kind: "vouch" | "dispute") {
    if (!viewerPlayerId) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "vouch") await vouchMatch(match.id, viewerPlayerId);
      else await disputeMatch(match.id, viewerPlayerId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-white/30 bg-black p-5">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <span
          className={`font-display text-display-xs uppercase font-bold tracking-wide ${status.color}`}
        >
          {status.text}
        </span>
        <time
          dateTime={match.played_at}
          className="font-mono text-xs text-white/50"
        >
          {formatRelative(match.played_at)}
        </time>
      </div>

      {/* Court */}
      {match.court && (
        <div className="mt-1 text-sm text-white/60">
          {match.court.name} · {match.court.city}, {match.court.state}
        </div>
      )}

      {/* Mini court layout: serving team / score / net / score / receiving team */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border-2 border-white/20 bg-[#0a2540] p-3">
        {/* Serving team */}
        <div className="min-w-0">
          <div className="font-display text-[10px] uppercase font-bold tracking-widest text-pickle">
            Serving
          </div>
          <PlayerLine player={match.server_team_p1} starServer />
          <PlayerLine player={match.server_team_p2} />
        </div>
        {/* Center score */}
        <div className="flex shrink-0 flex-col items-center gap-1 px-2">
          <span
            className={`font-mono text-[28px] leading-none font-bold ${
              serverWon ? "text-pickle" : "text-white/60"
            }`}
          >
            {match.server_score}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/30">
            vs
          </span>
          <span
            className={`font-mono text-[28px] leading-none font-bold ${
              !serverWon ? "text-electric" : "text-white/60"
            }`}
          >
            {match.receiver_score}
          </span>
        </div>
        {/* Receiving team */}
        <div className="min-w-0">
          <div className="text-right font-display text-[10px] uppercase font-bold tracking-widest text-electric">
            Receiving
          </div>
          <PlayerLine player={match.receiver_team_p1} align="right" />
          <PlayerLine player={match.receiver_team_p2} align="right" />
        </div>
      </div>

      {/* Vouch / dispute actions */}
      {viewerCanVouch && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAction("vouch")}
            disabled={busy}
            className="soft-stamp rounded-xl bg-pickle px-5 py-2.5 font-display text-display-xs font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
          >
            ✓ Vouch
          </button>
          <button
            type="button"
            onClick={() => handleAction("dispute")}
            disabled={busy}
            className="rounded-xl border-2 border-electric bg-black px-5 py-2.5 font-display text-display-xs font-bold uppercase tracking-wide text-electric hover:bg-electric hover:text-black disabled:opacity-50"
          >
            ✗ Dispute
          </button>
          {error && (
            <span className="text-sm text-bright">⚠ {error}</span>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerLine({
  player,
  starServer = false,
  align = "left",
}: {
  player: { id: string; display_name: string; is_guest: boolean } | null;
  starServer?: boolean;
  align?: "left" | "right";
}) {
  if (!player) {
    return (
      <div
        className={`mt-1 text-sm text-white/30 ${align === "right" ? "text-right" : ""}`}
      >
        —
      </div>
    );
  }
  return (
    <div
      className={`mt-1.5 flex min-w-0 items-center gap-1.5 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <PlayerAvatar player={player} />
      <span className="min-w-0 truncate text-sm text-white">
        {starServer && (
          <span className="mr-0.5 text-pickle" aria-label="server">
            ★
          </span>
        )}
        {player.display_name}
      </span>
    </div>
  );
}

/**
 * Tiny avatar — colored circle with the player's initial.
 * Real photo upload comes later; this is the visual anchor for now.
 */
function PlayerAvatar({
  player,
}: {
  player: { display_name: string; is_guest: boolean };
}) {
  const initial = (player.display_name?.[0] ?? "?").toUpperCase();
  const styles = player.is_guest
    ? "border-bright text-bright"
    : "border-pickle text-pickle";
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-black font-mono text-[10px] font-bold ${styles}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
