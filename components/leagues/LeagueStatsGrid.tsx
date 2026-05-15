"use client";

import { useEffect, useState } from "react";
import {
  type LeagueState,
  type PlayerRoundPoints,
  fetchLeagueState,
  computePlayerRoundPoints,
} from "@/lib/leagues";
import Avatar from "@/components/Avatar";

interface Props {
  leagueId: string;
}

export default function LeagueStatsGrid({ leagueId }: Props) {
  const [state, setState] = useState<LeagueState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeagueState(leagueId).then((s) => {
      setState(s);
      setLoading(false);
    });
  }, [leagueId]);

  if (loading) {
    return <div className="mt-10 text-white/50">Loading stats…</div>;
  }
  if (!state) {
    return <div className="mt-10 text-bright">League not found.</div>;
  }

  const { league, players, rounds, matches } = state;
  const stats = computePlayerRoundPoints(league, players, rounds, matches);

  // Compute shared Y-axis maximum across all players so cards are comparable.
  let maxY = 0;
  for (const s of stats)
    for (const r of s.per_round) if (r.points > maxY) maxY = r.points;
  // Round up to a clean tick (multiple of 5) for nicer Y labels
  maxY = Math.max(5, Math.ceil(maxY / 5) * 5);

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s, i) => (
        <PlayerStatCard
          key={s.player_id}
          rank={i + 1}
          stats={s}
          maxY={maxY}
          nRounds={league.n_rounds}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Per-player card with mini line graph
// ----------------------------------------------------------------
function PlayerStatCard({
  rank,
  stats,
  maxY,
  nRounds,
}: {
  rank: number;
  stats: PlayerRoundPoints;
  maxY: number;
  nRounds: number;
}) {
  const isPodium = rank <= 3;
  return (
    <div
      className={`rounded-2xl border-2 px-4 py-3 ${
        isPodium ? "border-bright bg-bright/5" : "border-pickle/40 bg-pickle/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar player={stats} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-white/50">#{rank}</span>
            <span className="truncate font-display text-display-sm font-bold text-white">
              {stats.display_name}
            </span>
          </div>
          <div className="font-display text-display-base font-extrabold text-pickle">
            {stats.total_points}
            <span className="ml-1 text-xs font-normal text-white/50">pts</span>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <LineGraph perRound={stats.per_round} maxY={maxY} nRounds={nRounds} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// SVG line graph
// ----------------------------------------------------------------
function LineGraph({
  perRound,
  maxY,
  nRounds,
}: {
  perRound: PlayerRoundPoints["per_round"];
  maxY: number;
  nRounds: number;
}) {
  const W = 280;
  const H = 110;
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xStep = nRounds > 1 ? plotW / (nRounds - 1) : 0;

  function xOf(round: number) {
    return padL + (round - 1) * xStep;
  }
  function yOf(pts: number) {
    return padT + (1 - pts / maxY) * plotH;
  }

  // Build polyline (skips pending rounds at the end so the line doesn't
  // drop to 0 for not-yet-played rounds).
  const linePoints: string[] = [];
  for (const r of perRound) {
    if (r.result === "pending") break;
    linePoints.push(`${xOf(r.round)},${yOf(r.points)}`);
  }

  // Y-axis ticks: 0 and maxY
  const yTicks = [0, Math.floor(maxY / 2), maxY];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Points per round"
    >
      {/* Axes */}
      <line
        x1={padL}
        y1={padT}
        x2={padL}
        y2={padT + plotH}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={padT + plotH}
        x2={W - padR}
        y2={padT + plotH}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />

      {/* Y ticks */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            y1={yOf(t)}
            x2={W - padR}
            y2={yOf(t)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
          <text
            x={padL - 4}
            y={yOf(t)}
            fontSize="9"
            textAnchor="end"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.4)"
            fontFamily="monospace"
          >
            {t}
          </text>
        </g>
      ))}

      {/* X labels — rounds */}
      {perRound.map((r) => (
        <text
          key={r.round}
          x={xOf(r.round)}
          y={padT + plotH + 12}
          fontSize="9"
          textAnchor="middle"
          fill="rgba(255,255,255,0.45)"
          fontFamily="monospace"
        >
          {r.round}
        </text>
      ))}

      {/* Connecting line through played rounds */}
      {linePoints.length >= 2 && (
        <polyline
          fill="none"
          stroke="#99FF00"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={linePoints.join(" ")}
        />
      )}

      {/* Markers */}
      {perRound.map((r) => {
        const cx = xOf(r.round);
        const cy = yOf(r.points);
        if (r.result === "win") {
          return (
            <circle
              key={r.round}
              cx={cx}
              cy={cy}
              r="4"
              fill="#99FF00"
              stroke="#000"
              strokeWidth="1.5"
            />
          );
        }
        if (r.result === "loss") {
          return (
            <circle
              key={r.round}
              cx={cx}
              cy={cy}
              r="3.5"
              fill="none"
              stroke="#99FF00"
              strokeWidth="2"
            />
          );
        }
        if (r.result === "bye") {
          // small "×" at zero line
          const y0 = yOf(0);
          return (
            <g key={r.round} stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
              <line x1={cx - 3} y1={y0 - 3} x2={cx + 3} y2={y0 + 3} />
              <line x1={cx - 3} y1={y0 + 3} x2={cx + 3} y2={y0 - 3} />
            </g>
          );
        }
        // pending — nothing
        return null;
      })}
    </svg>
  );
}
