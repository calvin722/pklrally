"use client";

import PlayerSlot from "./PlayerSlot";
import type { PlayerSlot as PlayerSlotData } from "@/lib/rally";
import { useTheme } from "@/components/ThemeProvider";

export type SlotId = "server_p1" | "server_p2" | "receiver_p1" | "receiver_p2";

interface CourtCanvasProps {
  serverP1: PlayerSlotData | null; // top-left = active server
  serverP2: PlayerSlotData | null;
  receiverP1: PlayerSlotData | null;
  receiverP2: PlayerSlotData | null;
  serverScore: number;
  receiverScore: number;

  activeSlot: SlotId | null;
  onActivateSlot: (slot: SlotId | null) => void;
  onSlotChange: (slot: SlotId, value: PlayerSlotData | null) => void;

  onScoreChange: (team: "server" | "receiver", value: number) => void;

  excludeIds: string[];
}

/**
 * Top-down pickleball court — drawn to real proportions.
 *
 * Real-court dimensions (per side, half of 44'×20' total):
 *   - Back service area: 15' deep × 20' wide (split into two 15'×10' service boxes)
 *   - Non-volley zone (kitchen): 7' deep × 20' wide (single full-width rectangle)
 *   - Net: midline
 *
 * In the vertical layout we render here, that 15:7 service-to-kitchen ratio
 * is preserved via min-heights on the cells (≈200px : ≈95px).
 *
 * Color: deep electric-blue playing surface (echoes a real outdoor court),
 * white court lines, pickle-green outer frame with neon glow.
 */
export default function CourtCanvas({
  serverP1,
  serverP2,
  receiverP1,
  receiverP2,
  serverScore,
  receiverScore,
  activeSlot,
  onActivateSlot,
  onSlotChange,
  onScoreChange,
  excludeIds,
}: CourtCanvasProps) {
  const theme = useTheme();
  const isLight = theme === "light";

  // Theme-aware court palette. Real outdoor pickleball courts run from
  // bright sky-blue with terra-cotta kitchens (light mode here) to the
  // moody deep navy + dark clay arcade vibe (dark mode).
  const surfaceColor = isLight ? "#7BB3DD" : "#0a2540";
  const kitchenColor = isLight ? "#E8A88C" : "#7a4136";
  const lineColor = isLight ? "#FFFFFF" : "#FFFFFF";
  const netBg = isLight ? "#52525B" : "#000000";

  return (
    <div className="rounded-2xl border-2 border-pickle bg-black p-3 neon-pickle">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          ▲ Serving
        </span>
        <span className="font-display text-display-xs uppercase font-bold tracking-widest text-white/40">
          Pickleball Court
        </span>
      </div>

      {/* Court frame — white outer boundary, theme-aware playing surface */}
      <div
        className="overflow-hidden border-2"
        style={{ borderColor: lineColor, backgroundColor: surfaceColor }}
      >
        {/* === TOP HALF — serving team === */}

        {/* Back service courts (15 ft) — 2 boxes split by white center line */}
        <div
          className="grid grid-cols-2 border-b-2"
          style={{ minHeight: "200px", borderColor: lineColor }}
        >
          <div className="border-r-2 p-3" style={{ borderColor: lineColor }}>
            <PlayerSlot
              value={serverP1}
              isActive={activeSlot === "server_p1"}
              onActivate={() =>
                onActivateSlot(activeSlot === "server_p1" ? null : "server_p1")
              }
              onPick={(p) => onSlotChange("server_p1", p)}
              onClear={() => onSlotChange("server_p1", null)}
              excludeIds={excludeIds}
              isServer
              accent="pickle"
            />
          </div>
          <div className="p-3">
            <PlayerSlot
              value={serverP2}
              isActive={activeSlot === "server_p2"}
              onActivate={() =>
                onActivateSlot(activeSlot === "server_p2" ? null : "server_p2")
              }
              onPick={(p) => onSlotChange("server_p2", p)}
              onClear={() => onSlotChange("server_p2", null)}
              excludeIds={excludeIds}
              accent="pickle"
            />
          </div>
        </div>

        {/* Top kitchen (7 ft) — final score */}
        <KitchenZone
          accent="pickle"
          score={serverScore}
          onChange={(v) => onScoreChange("server", v)}
          team="serving"
          bgColor={kitchenColor}
        />

        {/* Net */}
        <NetBar bgColor={netBg} />

        {/* === BOTTOM HALF — receiving team === */}

        {/* Bottom kitchen (7 ft) — final score */}
        <KitchenZone
          accent="electric"
          score={receiverScore}
          onChange={(v) => onScoreChange("receiver", v)}
          team="receiving"
          bgColor={kitchenColor}
        />

        {/* Back service courts (15 ft) */}
        <div
          className="grid grid-cols-2 border-t-2"
          style={{ minHeight: "200px", borderColor: lineColor }}
        >
          <div className="border-r-2 p-3" style={{ borderColor: lineColor }}>
            <PlayerSlot
              value={receiverP1}
              isActive={activeSlot === "receiver_p1"}
              onActivate={() =>
                onActivateSlot(
                  activeSlot === "receiver_p1" ? null : "receiver_p1",
                )
              }
              onPick={(p) => onSlotChange("receiver_p1", p)}
              onClear={() => onSlotChange("receiver_p1", null)}
              excludeIds={excludeIds}
              accent="electric"
            />
          </div>
          <div className="p-3">
            <PlayerSlot
              value={receiverP2}
              isActive={activeSlot === "receiver_p2"}
              onActivate={() =>
                onActivateSlot(
                  activeSlot === "receiver_p2" ? null : "receiver_p2",
                )
              }
              onPick={(p) => onSlotChange("receiver_p2", p)}
              onClear={() => onSlotChange("receiver_p2", null)}
              excludeIds={excludeIds}
              accent="electric"
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end px-1">
        <span className="font-display text-display-xs uppercase font-bold tracking-widest text-electric">
          ▼ Receiving
        </span>
      </div>
    </div>
  );
}

interface KitchenZoneProps {
  accent: "pickle" | "electric";
  score: number;
  onChange: (next: number) => void;
  team: "serving" | "receiving";
  bgColor: string;
}

/**
 * Non-volley zone (kitchen) — 7 ft deep, full court width.
 * Holds the team's final score.
 */
function KitchenZone({ accent, score, onChange, team, bgColor }: KitchenZoneProps) {
  const accentColor = accent === "pickle" ? "text-pickle" : "text-electric";
  const accentBorder =
    accent === "pickle" ? "border-pickle" : "border-electric";

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{ minHeight: "95px", backgroundColor: bgColor }}
      aria-label={`${team} final score`}
    >
      <span
        className={`font-display text-display-xs uppercase font-bold tracking-widest ${accentColor}`}
      >
        Final Score
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, score - 1))}
          disabled={score === 0}
          aria-label={`Decrement ${team} score`}
          className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 ${accentBorder} bg-black/40 font-display text-display-base font-bold ${accentColor} transition hover:bg-current hover:text-black disabled:opacity-30`}
        >
          −
        </button>
        <span
          className={`min-w-[2.5ch] text-center font-mono text-[52px] leading-none font-bold ${accentColor}`}
        >
          {score}
        </span>
        <button
          type="button"
          onClick={() => onChange(score + 1)}
          aria-label={`Increment ${team} score`}
          className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 ${accentBorder} bg-black/40 font-display text-display-base font-bold ${accentColor} transition hover:bg-current hover:text-black`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** The net — horizontal mesh band between the two kitchens. */
function NetBar({ bgColor }: { bgColor: string }) {
  return (
    <div
      className="relative h-3"
      style={{ backgroundColor: bgColor }}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.7) 0 1px, transparent 1px 4px)",
        }}
      />
      <div
        className="absolute left-0 right-0 top-0 h-[2px]"
        style={{ backgroundColor: "#FFFFFF" }}
      />
      <div
        className="absolute left-0 right-0 bottom-0 h-[2px]"
        style={{ backgroundColor: "#FFFFFF" }}
      />
    </div>
  );
}
