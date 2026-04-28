"use client";

interface StartRallyButtonProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Chunky "Start Rally" call-to-action.
 * Position-agnostic — parent decides where it sits.
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
        bg-pickle px-6 py-4
        font-display text-display-base font-extrabold uppercase tracking-wide text-black
        transition-transform
        focus:outline-none focus-visible:ring-4 focus-visible:ring-bright/60
        ${className}
      `}
      aria-label="Start a new rally"
    >
      <span className="inline-flex items-center justify-center gap-3">
        <span aria-hidden>▶</span>
        Start Rally
      </span>
    </button>
  );
}
