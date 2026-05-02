"use client";

import { useMemo, useState } from "react";
import type { BlockWithAttendees } from "@/lib/play";

interface WeekCalendarProps {
  blocks: BlockWithAttendees[];
  timezone: string;
  /** Hour the calendar starts displaying (default 8 = 8 AM) */
  startHour?: number;
  /** Hour the calendar ends displaying (default 22 = 10 PM) */
  endHour?: number;
  /** Currently expanded block id, or null */
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
}

// Each hour gets this many pixels of vertical space
const HOUR_HEIGHT = 56;

// Color palette — block ids hash to one of these. Tints are tuned
// for a white background so the calendar reads cleanly in light mode.
const BLOCK_PALETTE: Array<{
  bg: string;
  border: string;
  text: string;
  badge: string;
}> = [
  { bg: "bg-pickle/30", border: "border-pickle", text: "text-zinc-900", badge: "bg-pickle" },
  { bg: "bg-electric/25", border: "border-electric", text: "text-zinc-900", badge: "bg-electric" },
  { bg: "bg-amber-300", border: "border-amber-600", text: "text-zinc-900", badge: "bg-amber-500" },
  { bg: "bg-purple-300", border: "border-purple-600", text: "text-zinc-900", badge: "bg-purple-500" },
  { bg: "bg-rose-300", border: "border-rose-600", text: "text-zinc-900", badge: "bg-rose-500" },
  { bg: "bg-teal-300", border: "border-teal-600", text: "text-zinc-900", badge: "bg-teal-500" },
];

function hashToPalette(id: string): (typeof BLOCK_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return BLOCK_PALETTE[Math.abs(hash) % BLOCK_PALETTE.length];
}

export default function WeekCalendar({
  blocks,
  timezone,
  startHour = 8,
  endHour = 22,
  selectedBlockId,
  onSelectBlock,
}: WeekCalendarProps) {
  const [activeDayIdx, setActiveDayIdx] = useState(0);

  // Build the 7-day window starting at "today" in the court's timezone.
  // Day labels + iso keys are computed in the court's TZ so blocks land in
  // the right column regardless of viewer location.
  const days = useMemo(() => buildWeekDays(timezone), [timezone]);

  // Index blocks by day key for column rendering
  const blocksByDay = useMemo(() => {
    const map = new Map<string, BlockWithAttendees[]>();
    for (const b of blocks) {
      const key = new Date(b.starts_at).toLocaleDateString("en-CA", {
        timeZone: timezone,
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [blocks, timezone]);

  // Auto-extend display range if any block falls outside default 8-10 PM
  const { effectiveStart, effectiveEnd } = useMemo(() => {
    let lo = startHour;
    let hi = endHour;
    for (const b of blocks) {
      const startH = hourFractionInTz(b.starts_at, timezone);
      const endH = hourFractionInTz(b.ends_at, timezone);
      if (startH < lo) lo = Math.floor(startH);
      if (endH > hi) hi = Math.ceil(endH);
    }
    return { effectiveStart: Math.max(0, lo), effectiveEnd: Math.min(24, hi) };
  }, [blocks, startHour, endHour, timezone]);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = effectiveStart; h <= effectiveEnd; h++) out.push(h);
    return out;
  }, [effectiveStart, effectiveEnd]);

  const totalHeight = (effectiveEnd - effectiveStart) * HOUR_HEIGHT;

  return (
    <div>
      {/* Mobile day picker — switches the visible single-day column */}
      <div className="mb-3 flex gap-1 overflow-x-auto sm:hidden">
        {days.map((d, i) => {
          const count = blocksByDay.get(d.key)?.length ?? 0;
          const active = i === activeDayIdx;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setActiveDayIdx(i)}
              className={`flex shrink-0 flex-col items-center rounded-lg border-2 px-3 py-1.5 transition ${
                active
                  ? "border-electric bg-electric text-black"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              <span className="font-display text-[10px] uppercase font-bold tracking-widest">
                {d.shortDay}
              </span>
              <span className="font-mono text-xs">{d.dayNum}</span>
              {count > 0 && (
                <span
                  className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-black" : "bg-electric"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-zinc-300 bg-white shadow-2xl">
        {/* Day-of-week header row (desktop only) */}
        <div className="hidden border-b-2 border-zinc-200 sm:grid sm:grid-cols-[60px_repeat(7,1fr)]">
          <div />
          {days.map((d) => (
            <div
              key={d.key}
              className="border-l border-zinc-200 px-2 py-2 text-center"
            >
              <p className="font-display text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                {d.shortDay}
              </p>
              <p className="font-mono text-sm font-bold text-zinc-900">
                {d.dayNum}
              </p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-[60px_1fr] sm:grid-cols-[60px_repeat(7,1fr)]">
          {/* Hours column */}
          <div
            className="relative border-r border-zinc-200"
            style={{ height: totalHeight }}
          >
            {hours.map((h, i) => {
              if (i === hours.length - 1) return null; // skip trailing label
              return (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-b border-zinc-100 px-2"
                  style={{
                    top: (h - effectiveStart) * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                  }}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                    {formatHour(h)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map((d, dayIdx) => {
            const dayBlocks = blocksByDay.get(d.key) ?? [];
            const visible =
              // Desktop: always show. Mobile: only show the active day.
              true;
            const isActiveDayMobile = dayIdx === activeDayIdx;
            return (
              <div
                key={d.key}
                className={`relative border-l border-zinc-200 ${
                  isActiveDayMobile ? "block" : "hidden"
                } sm:block`}
                style={{ height: totalHeight }}
              >
                {/* Hour grid lines */}
                {hours.map((h, i) => {
                  if (i === hours.length - 1) return null;
                  return (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-b border-zinc-100"
                      style={{
                        top: (h - effectiveStart) * HOUR_HEIGHT,
                        height: HOUR_HEIGHT,
                      }}
                    />
                  );
                })}

                {/* Blocks */}
                {visible &&
                  dayBlocks.map((b) => {
                    const startH = hourFractionInTz(b.starts_at, timezone);
                    const endH = hourFractionInTz(b.ends_at, timezone);
                    const top = (startH - effectiveStart) * HOUR_HEIGHT;
                    const height = Math.max(
                      24,
                      (endH - startH) * HOUR_HEIGHT,
                    );
                    const palette = hashToPalette(b.id);
                    const isCancelled = b.status === "cancelled";
                    const isSelected = selectedBlockId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          onSelectBlock(isSelected ? null : b.id)
                        }
                        className={`absolute left-1 right-1 overflow-hidden rounded-md border-2 px-1.5 py-1 text-left transition ${palette.border} ${
                          isCancelled
                            ? "bg-zinc-200 opacity-60"
                            : palette.bg
                        } ${palette.text} ${
                          isSelected
                            ? "ring-2 ring-offset-1 ring-electric z-10"
                            : "hover:opacity-90"
                        }`}
                        style={{ top, height }}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${palette.badge}`}
                            aria-hidden
                          />
                          <span className="truncate font-mono text-[10px] font-bold">
                            {formatTimeShort(b.starts_at, timezone)}
                          </span>
                        </div>
                        <p className="truncate text-[11px] font-semibold leading-tight">
                          {isCancelled ? (
                            <span className="line-through">Cancelled</span>
                          ) : (
                            `${b.attendees.length} going`
                          )}
                        </p>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Helpers
// =============================================================

function buildWeekDays(timezone: string): Array<{
  key: string;
  shortDay: string;
  dayNum: string;
}> {
  const out: Array<{ key: string; shortDay: string; dayNum: string }> = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    out.push({
      key: d.toLocaleDateString("en-CA", { timeZone: timezone }),
      shortDay: d.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: timezone,
      }),
      dayNum: d.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        timeZone: timezone,
      }),
    });
  }
  return out;
}

/** Hour as a fractional number in the given timezone — e.g. 18.5 = 6:30 PM */
function hourFractionInTz(iso: string, timezone: string): number {
  const dt = new Date(iso);
  // Use Intl to extract hours/minutes in tz
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(dt);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display} ${period}`;
}

function formatTimeShort(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}
