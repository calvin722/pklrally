"use client";

interface StartRallyButtonProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Chunky "Record Your Rally" call-to-action — matches FindGameButton's
 * two-line layout. Position-agnostic.
 */
export default function StartRallyButton({
  onClick,
  className = "",
}: StartRallyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        soft-stamp
        rounded-xl
        bg-pickle px-5 py-3
        font-display font-extrabold uppercase tracking-wide text-black
        transition-transform
        focus:outline-none focus-visible:ring-4 focus-visible:ring-bright/60
        ${className}
      `}
      aria-label="Record a rally to earn ladder points"
    >
      <span className="flex flex-col items-center justify-center leading-tight">
        <span className="text-display-base">
          <span aria-hidden className="mr-2">▶</span>
          Record Your Rally
        </span>
        <span className="mt-0.5 text-[10px] font-bold tracking-widest opacity-80">
          earn points → ladder prizes
        </span>
      </span>
    </button>
  );
}
