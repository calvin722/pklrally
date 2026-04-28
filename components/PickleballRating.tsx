"use client";

import { useId } from "react";

/**
 * Renders a self-rating (2.0–8.0) as a row of neon-green pickleballs.
 * Supports 0.25 increments via SVG pie-wedge fills:
 *   - 1.00 = full pickleball
 *   - 0.75 = three-quarter pie
 *   - 0.50 = half pie
 *   - 0.25 = quarter pie
 *
 * Example: 3.25 = three full pickleballs + one quarter slice.
 */
interface PickleballRatingProps {
  value: number;
  size?: number;
}

export default function PickleballRating({
  value,
  size = 18,
}: PickleballRatingProps) {
  // Snap to nearest 0.25
  const rounded = Math.round(value * 4) / 4;
  const fulls = Math.floor(rounded);
  const remainder = rounded - fulls; // 0, 0.25, 0.5, or 0.75

  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`Self-rated ${value.toFixed(2)} out of 8`}
    >
      <span className="font-mono text-display-base font-bold text-pickle">
        {value.toFixed(2)}
      </span>
      <span className="flex items-center gap-1">
        {Array.from({ length: fulls }).map((_, i) => (
          <Pickleball key={`f-${i}`} size={size} fill={1} />
        ))}
        {remainder > 0 && (
          <Pickleball key="partial" size={size} fill={remainder} />
        )}
      </span>
    </div>
  );
}

function Pickleball({ size, fill }: { size: number; fill: number }) {
  const id = useId().replace(/[:#]/g, "_");
  const clipId = `pkl-wedge-${id}`;

  // Full pickleball
  if (fill >= 1) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="#99FF00" stroke="#000" strokeWidth="0.5" />
        <Dimples />
      </svg>
    );
  }

  // Build the pie-slice path: from center, up to 12 o'clock, sweep clockwise
  // by `fill * 360°`, back to center.
  const cx = 8;
  const cy = 8;
  const r = 7;
  const angleRad = fill * 2 * Math.PI;
  const endX = cx + r * Math.sin(angleRad);
  const endY = cy - r * Math.cos(angleRad);
  const largeArc = fill > 0.5 ? 1 : 0;
  const wedgePath = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${endX.toFixed(4)} ${endY.toFixed(4)} Z`;

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <path d={wedgePath} />
        </clipPath>
      </defs>
      {/* Faint dashed outline so the full-ball shape is still implied */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#5C9900"
        strokeWidth="0.5"
        strokeDasharray="1 1"
        opacity="0.5"
      />
      {/* Filled wedge */}
      <path
        d={wedgePath}
        fill="#99FF00"
        stroke="#000"
        strokeWidth="0.5"
      />
      {/* Dimples clipped to the wedge area */}
      <g clipPath={`url(#${clipId})`}>
        <Dimples />
      </g>
    </svg>
  );
}

function Dimples() {
  return (
    <>
      <circle cx="5" cy="5" r="0.7" fill="#000" opacity="0.5" />
      <circle cx="11" cy="5" r="0.7" fill="#000" opacity="0.5" />
      <circle cx="3" cy="8" r="0.7" fill="#000" opacity="0.5" />
      <circle cx="8" cy="8" r="0.7" fill="#000" opacity="0.5" />
      <circle cx="13" cy="8" r="0.7" fill="#000" opacity="0.5" />
      <circle cx="5" cy="11" r="0.7" fill="#000" opacity="0.5" />
      <circle cx="11" cy="11" r="0.7" fill="#000" opacity="0.5" />
    </>
  );
}
