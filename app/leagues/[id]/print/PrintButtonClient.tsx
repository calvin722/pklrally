"use client";

export default function PrintButtonClient() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/80"
    >
      📄 Print
    </button>
  );
}
