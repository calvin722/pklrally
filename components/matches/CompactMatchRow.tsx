"use client";

import { useState } from "react";
import MatchCard from "./MatchCard";
import type { MatchSummary } from "@/lib/matches";
import { formatAtTz } from "@/lib/datetime";

interface CompactMatchRowProps {
  match: MatchSummary;
  viewerWon: boolean;
  viewerPlayerId: string;
}

/**
 * Compact one-line match summary for the stats page's "Recent matches" list.
 * Click anywhere on the row to expand into the full MatchCard layout
 * (showing players, court, score, hearts). Click again to collapse.
 */
export default function CompactMatchRow({
  match,
  viewerWon,
  viewerPlayerId,
}: CompactMatchRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Display in the court's timezone, not the viewer's
  const tz = match.court?.timezone ?? null;
  const dateStr = formatAtTz(match.played_at, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = formatAtTz(match.played_at, tz, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  if (expanded) {
    return (
      <li className="px-3 py-3">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mb-2 font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
          aria-expanded
        >
          ▲ Collapse
        </button>
        <MatchCard
          match={match}
          viewerPlayerId={viewerPlayerId}
          compact
        />
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        aria-expanded={false}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-extrabold ${
            viewerWon ? "bg-pickle text-black" : "bg-electric text-black"
          }`}
          aria-label={viewerWon ? "Win" : "Loss"}
        >
          {viewerWon ? "W" : "L"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-sans text-sm text-white">
            {match.court?.name ?? "Unknown court"}
          </div>
          <div className="text-xs text-white/50">
            {dateStr} · {timeStr}
          </div>
        </div>
        <div className="shrink-0 font-mono text-sm text-white/70">
          {match.server_score} – {match.receiver_score}
        </div>
        <span aria-hidden className="ml-1 text-white/30">
          ▾
        </span>
      </button>
    </li>
  );
}
