"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper for StateMap — exists solely so the dynamic import with
 * `ssr: false` lives in a client module (Next.js 15 forbids `ssr: false`
 * dynamic imports inside Server Components).
 */
const StateMap = dynamic(() => import("@/components/StateMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <span className="font-display text-display-sm uppercase font-semibold tracking-wide text-pickle animate-flicker">
        Loading map...
      </span>
    </div>
  ),
});

export default function StateMapWrapper({ stateCode }: { stateCode: string }) {
  return <StateMap stateCode={stateCode} />;
}
