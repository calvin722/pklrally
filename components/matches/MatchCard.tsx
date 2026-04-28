"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  vouchMatch,
  disputeMatch,
  resubmitMatch,
  cancelMatch,
  type MatchSummary,
} from "@/lib/matches";
import Avatar from "@/components/Avatar";

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

  // Edit state — for the logger to fix a disputed match's score
  const [editing, setEditing] = useState(false);
  const [editServer, setEditServer] = useState(match.server_score);
  const [editReceiver, setEditReceiver] = useState(match.receiver_score);

  const viewerIsLogger = viewerPlayerId === match.logged_by;
  const canEditDispute =
    !compact && match.status === "disputed" && viewerIsLogger;

  async function handleResubmit() {
    if (editServer === editReceiver) {
      setError("Scores can't be a tie.");
      return;
    }
    if (editServer < 0 || editReceiver < 0) {
      setError("Scores must be 0 or higher.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resubmitMatch(match.id, editServer, editReceiver);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resubmit failed.");
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (
      !window.confirm(
        "Cancel this match? It won't count toward anyone's stats and will disappear from public timelines.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await cancelMatch(match.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
      setBusy(false);
    }
  }

  // Likes state — fetched on mount, optimistic update on toggle
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [iLiked, setILiked] = useState<boolean>(false);
  const [likeBusy, setLikeBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    async function loadLikes() {
      const { count } = await supabase
        .from("match_likes")
        .select("id", { count: "exact", head: true })
        .eq("match_id", match.id);
      if (alive) setLikeCount(count ?? 0);

      if (viewerPlayerId) {
        const { data } = await supabase
          .from("match_likes")
          .select("id")
          .eq("match_id", match.id)
          .eq("player_id", viewerPlayerId)
          .maybeSingle();
        if (alive) setILiked(!!data);
      }
    }
    loadLikes();
    return () => {
      alive = false;
    };
  }, [match.id, viewerPlayerId]);

  async function toggleLike() {
    if (!viewerPlayerId || likeBusy) return;
    setLikeBusy(true);
    const supabase = createClient();
    const wasLiked = iLiked;

    // Optimistic update
    setILiked(!wasLiked);
    setLikeCount((c) => (c ?? 0) + (wasLiked ? -1 : 1));

    if (wasLiked) {
      const { error } = await supabase
        .from("match_likes")
        .delete()
        .eq("match_id", match.id)
        .eq("player_id", viewerPlayerId);
      if (error) {
        setILiked(true);
        setLikeCount((c) => (c ?? 0) + 1);
      }
    } else {
      const { error } = await supabase
        .from("match_likes")
        .insert({ match_id: match.id, player_id: viewerPlayerId });
      if (error) {
        setILiked(false);
        setLikeCount((c) => Math.max(0, (c ?? 0) - 1));
      }
    }
    setLikeBusy(false);
  }

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

      {/* Disputed match: logger-only edit + cancel actions */}
      {canEditDispute && !editing && (
        <div className="mt-4 rounded-xl border-2 border-electric/40 bg-electric/5 p-4">
          <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-electric">
            ⚠ Match disputed by an opponent
          </div>
          <p className="mt-1 text-sm text-white/70 leading-relaxed">
            Either fix the score and resubmit (opponents will re-vouch), or
            cancel the match entirely.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl bg-pickle px-4 py-2 font-display text-display-xs font-extrabold uppercase tracking-wide text-black hover:bg-pickle-dim"
            >
              Edit score
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-xl border-2 border-bright px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black disabled:opacity-50"
            >
              Cancel match
            </button>
          </div>
        </div>
      )}

      {canEditDispute && editing && (
        <div className="mt-4 rounded-xl border-2 border-pickle bg-pickle/5 p-4">
          <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            New score
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-display text-[10px] uppercase font-bold tracking-widest text-pickle">
                Serving
              </span>
              <input
                type="number"
                min={0}
                max={99}
                value={editServer}
                onChange={(e) =>
                  setEditServer(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
                className="mt-1 w-full rounded-lg border-2 border-white bg-black px-3 py-2 text-center font-mono text-2xl text-pickle focus:border-pickle focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-display text-[10px] uppercase font-bold tracking-widest text-electric">
                Receiving
              </span>
              <input
                type="number"
                min={0}
                max={99}
                value={editReceiver}
                onChange={(e) =>
                  setEditReceiver(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
                className="mt-1 w-full rounded-lg border-2 border-white bg-black px-3 py-2 text-center font-mono text-2xl text-electric focus:border-electric focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleResubmit}
              disabled={busy}
              className="soft-stamp rounded-xl bg-pickle px-4 py-2 font-display text-display-xs font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
            >
              {busy ? "Saving..." : "Resubmit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditServer(match.server_score);
                setEditReceiver(match.receiver_score);
                setError(null);
              }}
              disabled={busy}
              className="rounded-xl border-2 border-white/40 px-4 py-2 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Heart / like row — always visible */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleLike}
          disabled={!viewerPlayerId || likeBusy}
          className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 transition disabled:cursor-not-allowed ${
            iLiked
              ? "border-bright bg-bright/10 text-bright"
              : "border-white/30 text-white/70 hover:border-bright hover:text-bright"
          }`}
          aria-label={iLiked ? "Unlike" : "Like"}
          title={
            !viewerPlayerId
              ? "Sign in to like matches"
              : iLiked
                ? "Unlike"
                : "Like"
          }
        >
          <span className="text-base leading-none">
            {iLiked ? "♥" : "♡"}
          </span>
          <span className="font-mono text-sm font-bold">
            {likeCount ?? "—"}
          </span>
        </button>

        {viewerCanVouch && (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        )}
      </div>
      {error && <span className="mt-2 block text-sm text-bright">⚠ {error}</span>}
    </div>
  );
}

function PlayerLine({
  player,
  starServer = false,
  align = "left",
}: {
  player: {
    id: string;
    display_name: string;
    is_guest: boolean;
    avatar_url: string | null;
  } | null;
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

  // Guests don't have profiles to navigate to (until they claim their account)
  const isClickable = !player.is_guest;
  const inner = (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <Avatar player={player} size="xs" />
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

  if (!isClickable) {
    return <div className="mt-1.5">{inner}</div>;
  }

  return (
    <Link
      href={`/profile/${player.id}`}
      className="mt-1.5 block transition hover:opacity-80"
    >
      {inner}
    </Link>
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
