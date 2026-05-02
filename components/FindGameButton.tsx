"use client";

interface FindGameButtonProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Chunky "Find Open Play" call-to-action — mirrors StartRallyButton's
 * style/size but uses the electric-blue accent so the two CTAs read as
 * a pair (pickle = log; electric = find).
 */
export default function FindGameButton({
  onClick,
  className = "",
}: FindGameButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        soft-stamp
        rounded-xl
        bg-electric px-5 py-3
        font-display font-extrabold uppercase tracking-wide text-black
        transition-transform
        focus:outline-none focus-visible:ring-4 focus-visible:ring-bright/60
        ${className}
      `}
      aria-label="Find open play in your area"
    >
      <span className="flex flex-col items-center justify-center leading-tight">
        <span className="text-display-base">
          <span aria-hidden className="mr-2">📍</span>
          Find Open Play
        </span>
        <span className="mt-0.5 text-[10px] font-bold tracking-widest opacity-80">
          in your area
        </span>
      </span>
    </button>
  );
}
