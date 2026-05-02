"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockWithAttendees } from "@/lib/play";
import Avatar from "@/components/Avatar";

interface WeekCalendarProps {
  blocks: BlockWithAttendees[];
  timezone: string;
  /** Default visible start hour (the window auto-scrolls here on load).
   *  Full 24-hour grid is always rendered; this just sets the initial view. */
  visibleStartHour?: number;
  /** Default visible end hour. */
  visibleEndHour?: number;
  /** Currently expanded block id, or null */
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  /** For showing Join/Leave directly on the block */
  currentPlayerId: string | null;
  onJoin: (blockId: string) => void;
  onLeave: (blockId: string) => void;
  /** Block id currently in flight (join/leave busy) */
  busyBlockId: string | null;
}

// Each hour gets this many pixels of vertical space
const HOUR_HEIGHT = 56;

// Color palette for block backgrounds. Tailwind's custom config doesn't
// include zinc/amber/purple/rose/teal, so we use arbitrary hex literals
// (bg-[#xxx]) which always generate. Tints are tuned for a cool-gray
// calendar background.
const BLOCK_PALETTE: Array<{
  bg: string;
  border: string;
  badge: string;
}> = [
  { bg: "bg-[#D9F99D]", border: "border-[#65A30D]", badge: "bg-[#65A30D]" },   // lime
  { bg: "bg-[#BAE6FD]", border: "border-[#0284C7]", badge: "bg-[#0284C7]" },   // sky blue
  { bg: "bg-[#FED7AA]", border: "border-[#EA580C]", badge: "bg-[#EA580C]" },   // amber
  { bg: "bg-[#E9D5FF]", border: "border-[#9333EA]", badge: "bg-[#9333EA]" },   // purple
  { bg: "bg-[#FECDD3]", border: "border-[#E11D48]", badge: "bg-[#E11D48]" },   // rose
  { bg: "bg-[#99F6E4]", border: "border-[#0D9488]", badge: "bg-[#0D9488]" },   // teal
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
  visibleStartHour = 7,
  visibleEndHour = 21,
  selectedBlockId,
  onSelectBlock,
  currentPlayerId,
  onJoin,
  onLeave,
  busyBlockId,
}: WeekCalendarProps) {
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Build the 7-day window starting at "today" in the court's timezone.
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

  // Full 24-hour grid is always rendered. Block positions are computed
  // from absolute hour 0 (midnight) so the math is straightforward.
  const TOTAL_HOURS = 24;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = 0; h <= TOTAL_HOURS; h++) out.push(h);
    return out;
  }, []);

  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT;
  const visibleHeight = (visibleEndHour - visibleStartHour) * HOUR_HEIGHT;

  // Scroll to the default visible window (7 AM by default) on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = visibleStartHour * HOUR_HEIGHT;
    }
  }, [visibleStartHour]);

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
                  : "border-[#D4D4D8] bg-[#F4F4F5] text-[#3F3F46]"
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

      <div className="overflow-hidden rounded-2xl border-2 border-[#D4D4D8] bg-[#F4F4F5] shadow-2xl">
        {/* Day-of-week header row (desktop only) — sticks above the
            scrollable grid */}
        <div className="hidden border-b-2 border-[#D4D4D8] bg-[#FAFAFA] sm:grid sm:grid-cols-[60px_repeat(7,1fr)]">
          <div />
          {days.map((d, i) => {
            const isToday = i === 0;
            return (
              <div
                key={d.key}
                className="border-l border-[#E4E4E7] px-2 py-2 text-center"
              >
                <p
                  className={`font-display text-[10px] uppercase font-bold tracking-widest ${
                    isToday ? "text-electric" : "text-[#71717A]"
                  }`}
                >
                  {isToday ? "TODAY" : d.shortDay}
                </p>
                <p className="font-mono text-sm font-bold text-[#18181B]">
                  {d.dayNum}
                </p>
              </div>
            );
          })}
        </div>

        {/* Scrollable time grid — full 24h rendered, default viewport
            shows visibleStart..visibleEnd, user can scroll to see early
            morning or late night. */}
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: visibleHeight }}
        >
        <div className="grid grid-cols-[60px_1fr] sm:grid-cols-[60px_repeat(7,1fr)]">
          {/* Hours column */}
          <div
            className="relative border-r border-[#D4D4D8] bg-[#FAFAFA]"
            style={{ height: totalHeight }}
          >
            {hours.map((h, i) => {
              if (i === hours.length - 1) return null; // skip trailing label
              return (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-b border-[#E4E4E7] px-2"
                  style={{
                    top: h * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                  }}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-[#52525B]">
                    {formatHour(h)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map((d, dayIdx) => {
            const dayBlocks = blocksByDay.get(d.key) ?? [];
            const isActiveDayMobile = dayIdx === activeDayIdx;
            return (
              <div
                key={d.key}
                className={`relative border-l border-[#E4E4E7] bg-[#F4F4F5] ${
                  isActiveDayMobile ? "block" : "hidden"
                } sm:block`}
                style={{ height: totalHeight }}
              >
                {/* Hour grid lines — pointer-events-none so they don't
                    swallow clicks meant for the blocks above them */}
                {hours.map((h, i) => {
                  if (i === hours.length - 1) return null;
                  return (
                    <div
                      key={h}
                      className="pointer-events-none absolute left-0 right-0 border-b border-[#E4E4E7]"
                      style={{
                        top: h * HOUR_HEIGHT,
                        height: HOUR_HEIGHT,
                      }}
                    />
                  );
                })}

                {/* Blocks */}
                {dayBlocks.map((b) => {
                  const startH = hourFractionInTz(b.starts_at, timezone);
                  const endH = hourFractionInTz(b.ends_at, timezone);
                  const top = startH * HOUR_HEIGHT;
                  // Comfortable tap target — minimum 80px even if the
                  // block is a 30-minute slot
                  const height = Math.max(
                    80,
                    (endH - startH) * HOUR_HEIGHT,
                  );
                  return (
                    <CalendarBlock
                      key={b.id}
                      block={b}
                      timezone={timezone}
                      top={top}
                      height={height}
                      isSelected={selectedBlockId === b.id}
                      isBusy={busyBlockId === b.id}
                      currentPlayerId={currentPlayerId}
                      onSelect={() =>
                        onSelectBlock(
                          selectedBlockId === b.id ? null : b.id,
                        )
                      }
                      onJoin={() => onJoin(b.id)}
                      onLeave={() => onLeave(b.id)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// CalendarBlock — one positioned block inside a day column
// =============================================================
function CalendarBlock({
  block,
  timezone,
  top,
  height,
  isSelected,
  isBusy,
  currentPlayerId,
  onSelect,
  onJoin,
  onLeave,
}: {
  block: BlockWithAttendees;
  timezone: string;
  top: number;
  height: number;
  isSelected: boolean;
  isBusy: boolean;
  currentPlayerId: string | null;
  onSelect: () => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const palette = hashToPalette(block.id);
  const isCancelled = block.status === "cancelled";
  const youAreIn = currentPlayerId
    ? block.attendees.some((a) => a.player_id === currentPlayerId)
    : false;

  // Show up to 4 mini avatars, +N for overflow
  const previewCount = 4;
  const preview = block.attendees.slice(0, previewCount);
  const overflow = block.attendees.length - previewCount;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md border-2 px-2 py-1.5 text-[#18181B] transition ${palette.border} ${
        isCancelled ? "bg-[#E4E4E7] opacity-60" : palette.bg
      } ${
        isSelected
          ? "ring-2 ring-offset-1 ring-electric z-10"
          : "hover:opacity-95 hover:shadow-md"
      }`}
      style={{ top, height }}
    >
      {/* Time + count row */}
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[10px] font-bold">
          {formatTimeShort(block.starts_at, timezone)}
        </span>
        <span className="font-mono text-[10px] font-bold">
          {isCancelled ? "—" : `${block.attendees.length}`}
        </span>
      </div>

      {/* Avatars row */}
      {!isCancelled && preview.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          {preview.map((a) => (
            <Avatar
              key={a.player_id}
              player={{
                display_name: a.display_name,
                avatar_url: a.avatar_url,
                avatar_focal_x: a.avatar_focal_x,
                avatar_focal_y: a.avatar_focal_y,
                is_guest: a.is_guest,
              }}
              size="xs"
            />
          ))}
          {overflow > 0 && (
            <span className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#3F3F46] bg-white font-mono text-[9px] font-bold text-[#18181B]">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {/* Action button — Join / Leave. Wrapped in a small layer that
          stops both onClick AND onMouseDown from bubbling so the parent
          block's tap handler doesn't open the modal at the same time. */}
      {currentPlayerId && !isCancelled && (
        <div
          className="mt-1.5"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (youAreIn) onLeave();
              else onJoin();
            }}
            disabled={isBusy}
            className={`w-full rounded-md px-2 py-1.5 font-display text-[11px] font-extrabold uppercase tracking-wider transition disabled:opacity-50 ${
              youAreIn
                ? "border-2 border-[#3F3F46] bg-white text-[#18181B] hover:bg-[#F4F4F5]"
                : "bg-electric text-black shadow-sm hover:opacity-90"
            }`}
          >
            {isBusy ? "Saving…" : youAreIn ? "Leave" : "+ Join"}
          </button>
        </div>
      )}

      {isCancelled && (
        <p className="mt-1 truncate text-[11px] font-semibold line-through">
          Cancelled
        </p>
      )}
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
