"use client";

interface FindGameButtonProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Chunky "Find a Game" call-to-action — mirrors StartRallyButton's
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
        bg-electric px-6 py-4
        font-display text-display-base font-extrabold uppercase tracking-wide text-black
        transition-transform
        focus:outline-none focus-visible:ring-4 focus-visible:ring-bright/60
        ${className}
      `}
      aria-label="Find a game near you"
    >
      <span className="inline-flex items-center justify-center gap-3">
        <span aria-hidden>📍</span>
        Find a Game
      </span>
    </button>
  );
}
