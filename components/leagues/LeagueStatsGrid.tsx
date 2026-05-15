"use client";

import { useEffect, useMemo, useState } from "react";
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

/**
 * Single combined chart: every player's cumulative points across rounds.
 * X = round number, Y = cumulative points. Hovering a legend row
 * highlights that player's line.
 */
export default function LeagueStatsGrid({ leagueId }: Props) {
  const [state, setState] = useState<LeagueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetchLeagueState(leagueId).then((s) => {
      setState(s);
      setLoading(false);
    });
  }, [leagueId]);

  // Build cumulative series for every player, even when state is null,
  // so hooks stay in a consistent order between renders.
  const series = useMemo(() => {
    if (!state) return [] as Array<PlayerRoundPoints & {
      color: string;
      cumulative: number[];
    }>;
    const stats = computePlayerRoundPoints(
      state.league,
      state.players,
      state.rounds,
      state.matches,
    );
    return stats.map((p, idx) => {
      let acc = 0;
      const cumulative = p.per_round.map((r) => {
        if (r.result !== "pending") acc += r.points;
        return acc;
      });
      return { ...p, color: colorForIndex(idx, stats.length), cumulative };
    });
  }, [state]);

  if (loading) {
    return <div className="mt-10 text-white/50">Loading stats…</div>;
  }
  if (!state) {
    return <div className="mt-10 text-bright">League not found.</div>;
  }
  if (series.length === 0) {
    return <div className="mt-10 text-white/50">No players yet.</div>;
  }

  const nRounds = state.league.n_rounds;
  // Max Y so all lines fit. Round up to a clean tick.
  let maxY = 0;
  for (const p of series) {
    for (const c of p.cumulative) if (c > maxY) maxY = c;
  }
  maxY = Math.max(20, Math.ceil(maxY / 20) * 20);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="rounded-2xl border-2 border-pickle bg-pickle/5 p-4">
        <CombinedChart
          series={series}
          nRounds={nRounds}
          maxY={maxY}
          highlight={hover}
        />
      </div>
      <Legend
        series={series}
        highlight={hover}
        onHover={setHover}
      />
    </div>
  );
}

// =====================================================================
// Combined chart
// =====================================================================
function CombinedChart({
  series,
  nRounds,
  maxY,
  highlight,
}: {
  series: Array<PlayerRoundPoints & { color: string; cumulative: number[] }>;
  nRounds: number;
  maxY: number;
  highlight: string | null;
}) {
  const W = 800;
  const H = 460;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xStep = nRounds > 1 ? plotW / (nRounds - 1) : 0;

  const xOf = (round: number) => padL + (round - 1) * xStep;
  const yOf = (pts: number) => padT + (1 - pts / maxY) * plotH;

  // Y ticks: ~5 evenly spaced
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxY * i) / tickCount),
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Cumulative points per round, all players"
      className="touch-pan-y"
    >
      {/* Y-axis gridlines + labels */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            y1={yOf(t)}
            x2={W - padR}
            y2={yOf(t)}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
          <text
            x={padL - 6}
            y={yOf(t)}
            fontSize="11"
            textAnchor="end"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.5)"
            fontFamily="monospace"
          >
            {t}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {Array.from({ length: nRounds }, (_, i) => i + 1).map((r) => (
        <g key={r}>
          <line
            x1={xOf(r)}
            y1={padT}
            x2={xOf(r)}
            y2={padT + plotH}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
          <text
            x={xOf(r)}
            y={padT + plotH + 18}
            fontSize="11"
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontFamily="monospace"
          >
            R{r}
          </text>
        </g>
      ))}

      {/* Axis lines */}
      <line
        x1={padL}
        y1={padT}
        x2={padL}
        y2={padT + plotH}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={padT + plotH}
        x2={W - padR}
        y2={padT + plotH}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />

      {/* Lines — non-highlighted first, then highlighted on top */}
      {series
        .filter((p) => highlight === null || highlight !== p.player_id)
        .map((p) => (
          <PlayerLine
            key={p.player_id}
            p={p}
            xOf={xOf}
            yOf={yOf}
            faded={highlight !== null}
          />
        ))}
      {highlight !== null &&
        series
          .filter((p) => p.player_id === highlight)
          .map((p) => (
            <PlayerLine
              key={p.player_id}
              p={p}
              xOf={xOf}
              yOf={yOf}
              emphasized
            />
          ))}

      {/* Y-axis title (rotated) */}
      <text
        x={14}
        y={padT + plotH / 2}
        fontSize="10"
        textAnchor="middle"
        transform={`rotate(-90 14 ${padT + plotH / 2})`}
        fill="rgba(255,255,255,0.45)"
        fontFamily="monospace"
      >
        Cumulative points
      </text>
    </svg>
  );
}

function PlayerLine({
  p,
  xOf,
  yOf,
  faded = false,
  emphasized = false,
}: {
  p: PlayerRoundPoints & { color: string; cumulative: number[] };
  xOf: (r: number) => number;
  yOf: (pts: number) => number;
  faded?: boolean;
  emphasized?: boolean;
}) {
  // Build polyline through played rounds only — break at pending so the
  // line doesn't drop to 0 for not-yet-played rounds.
  const linePoints: string[] = [];
  for (let i = 0; i < p.per_round.length; i++) {
    const r = p.per_round[i];
    if (r.result === "pending") break;
    linePoints.push(`${xOf(r.round)},${yOf(p.cumulative[i])}`);
  }
  const opacity = faded ? 0.18 : emphasized ? 1 : 0.85;
  const strokeWidth = emphasized ? 3 : 1.8;

  return (
    <g opacity={opacity}>
      {linePoints.length >= 2 && (
        <polyline
          fill="none"
          stroke={p.color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={linePoints.join(" ")}
        />
      )}
      {p.per_round.map((r, i) => {
        if (r.result === "pending") return null;
        return (
          <circle
            key={r.round}
            cx={xOf(r.round)}
            cy={yOf(p.cumulative[i])}
            r={emphasized ? 4 : 2.5}
            fill={p.color}
            stroke="#000"
            strokeWidth="1"
          />
        );
      })}
    </g>
  );
}

// =====================================================================
// Legend (sortable list, avatar + name + total)
// =====================================================================
function Legend({
  series,
  highlight,
  onHover,
}: {
  series: Array<PlayerRoundPoints & { color: string; cumulative: number[] }>;
  highlight: string | null;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-3">
      <div className="px-2 pb-2 font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
        Players · hover to highlight
      </div>
      <ul className="max-h-[460px] overflow-y-auto">
        {series.map((p, i) => {
          const dimmed = highlight !== null && highlight !== p.player_id;
          return (
            <li
              key={p.player_id}
              onMouseEnter={() => onHover(p.player_id)}
              onMouseLeave={() => onHover(null)}
              className={`flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                dimmed ? "opacity-40" : ""
              } ${highlight === p.player_id ? "bg-white/5" : "hover:bg-white/5"}`}
            >
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <span className="w-5 font-mono text-xs text-white/50">
                #{i + 1}
              </span>
              <Avatar player={p} size="xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {p.display_name}
              </span>
              <span className="font-mono text-xs font-bold text-pickle">
                {p.total_points}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// =====================================================================
// Color palette — evenly spaced hues so 20 lines stay distinguishable
// =====================================================================
function colorForIndex(i: number, n: number): string {
  const total = Math.max(n, 1);
  const hue = (i * 360) / total;
  // Bright but readable on a dark background
  return `hsl(${hue.toFixed(0)} 85% 60%)`;
}
