/**
 * Renders a DUPR-style rating (2.0–8.0) as a row of neon-green pickleballs.
 * 3.5 = three full + one half.
 */
interface PickleballRatingProps {
  value: number;
  size?: number;
}

export default function PickleballRating({
  value,
  size = 18,
}: PickleballRatingProps) {
  const rounded = Math.round(value * 2) / 2;
  const fulls = Math.floor(rounded);
  const hasHalf = rounded - fulls >= 0.5;

  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`Self-rated ${value.toFixed(1)} out of 8`}
    >
      <span className="font-mono text-display-base font-bold text-pickle">
        {value.toFixed(1)}
      </span>
      <span className="flex items-center gap-1">
        {Array.from({ length: fulls }).map((_, i) => (
          <Pickleball key={`f-${i}`} size={size} half={false} />
        ))}
        {hasHalf && <Pickleball size={size} half />}
      </span>
    </div>
  );
}

/** A smooth modern pickleball — green circle with classic dimple pattern. */
function Pickleball({ size, half }: { size: number; half: boolean }) {
  const id = half ? "pkl-half" : "pkl-full";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {half && (
        <defs>
          <clipPath id={id}>
            <rect x="0" y="0" width="8" height="16" />
          </clipPath>
        </defs>
      )}
      <g clipPath={half ? `url(#${id})` : undefined}>
        <circle cx="8" cy="8" r="7" fill="#99FF00" stroke="#000" strokeWidth="0.5" />
        {/* Dimple pattern */}
        <circle cx="5" cy="5" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="11" cy="5" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="3" cy="8" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="8" cy="8" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="13" cy="8" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="5" cy="11" r="0.7" fill="#000" opacity="0.5" />
        <circle cx="11" cy="11" r="0.7" fill="#000" opacity="0.5" />
      </g>
      {/* Half-pickleball: hard edge on the right */}
      {half && <line x1="8" y1="1" x2="8" y2="15" stroke="#5C9900" strokeWidth="1" />}
    </svg>
  );
}
