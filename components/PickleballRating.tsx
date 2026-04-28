"use client";

import { useId } from "react";

/**
 * Renders a self-rating (2.0–8.0) as a row of neon-green pickleballs.
 * Supports 0.25 increments via partial-fill clipping:
 *   - 1.00 = full pickleball
 *   - 0.75 = three-quarter
 *   - 0.50 = half
 *   - 0.25 = quarter
 *
 * Example: 3.25 = three full pickleballs + one quarter.
 */
interface PickleballRatingProps {
  value: number;
  size?: number;
}

export default function PickleballRating({
  value,
  size = 18,
}: PickleballRatingProps) {
  // Snap to the nearest 0.25 for the visual representation
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
  // Use React's useId to make clip-path IDs unique per instance — multiple
  // pickleballs on the page would otherwise conflict on shared IDs.
  const id = useId().replace(/[:#]/g, "_");
  const clipId = `pkl-${id}`;
  const clipWidth = Math.max(0, Math.min(16, Math.round(16 * fill)));
  const isPartial = fill < 1;

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {isPartial && (
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={clipWidth} height="16" />
          </clipPath>
        </defs>
      )}
      <g clipPath={isPartial ? `url(#${clipId})` : undefined}>
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="#99FF00"
          stroke="#000"
          strokeWidth="0.5"
        />
        {/* Pickleball dimples */}
        <circle cx="5" cy="5" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="11" cy="5" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="3" cy="8" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="8" cy="8" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="13" cy="8" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="5" cy="11" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="11" cy="11" r="0.7" fill="#000" opacity="0.5" />
      </g>
      {/* Cut-line at the partial-fill boundary for visual clarity */}
      {isPartial && clipWidth > 0 && clipWidth < 16 && (
        <line
          x1={clipWidth}
          y1="1"
          x2={clipWidth}
          y2="15"
          stroke="#5C9900"
          strokeWidth="1"
        />
      )}
      {/* Outline of the empty portion so the partial ball still reads as a ball */}
      {isPartial && (
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="none"
          stroke="#5C9900"
          strokeWidth="0.5"
          strokeDasharray="1 1"
          opacity="0.4"
        />
      )}
    </svg>
  );
}
