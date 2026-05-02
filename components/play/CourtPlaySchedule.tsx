"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  fetchCourtBlocks,
  joinBlock,
  leaveBlock,
  cancelBlock,
  createBlock,
  formatBlockTimeRange,
  type BlockWithAttendees,
} from "@/lib/play";
import Avatar from "@/components/Avatar";
import InviteToBlockSheet from "@/components/play/InviteToBlockSheet";
import WeekCalendar from "@/components/play/WeekCalendar";

interface Props {
  courtId: string;
  courtName: string;
  timezone: string;
  currentPlayerId: string | null;
  currentPlayerName: string | null;
}

export default function CourtPlaySchedule({
  courtId,
  courtName,
  timezone,
  currentPlayerId,
  currentPlayerName,
}: Props) {
  const [blocks, setBlocks] = useState<BlockWithAttendees[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [invitingBlockId, setInvitingBlockId] = useState<string | null>(null);
  const pathname = usePathname();
  const signInHref = `/login?next=${encodeURIComponent(pathname || "/play")}`;

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const data = await fetchCourtBlocks(courtId);
      if (alive) {
        setBlocks(data);
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [courtId]);

  async function refresh() {
    const data = await fetchCourtBlocks(courtId);
    setBlocks(data);
  }

  async function handleJoin(blockId: string) {
    if (!currentPlayerId) return;
    setBusy(blockId);
    try {
      await joinBlock(blockId, currentPlayerId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setBusy(null);
    }
  }

  async function handleLeave(blockId: string) {
    if (!currentPlayerId) return;
    setBusy(blockId);
    try {
      await leaveBlock(blockId, currentPlayerId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to leave");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel(blockId: string) {
    if (!confirm("Cancel this open play block? Attendees will see it as cancelled.")) return;
    setBusy(blockId);
    try {
      await cancelBlock(blockId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setBusy(null);
    }
  }

  const openBlocks = blocks.filter((b) => b.status === "open");
  const cancelled = blocks.filter((b) => b.status === "cancelled");

  return (
    <div className="mt-6">
      {/* Add block CTA */}
      {currentPlayerId ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded-2xl border-2 border-electric bg-electric/10 px-5 py-4 text-left transition hover:bg-electric/20"
        >
          <p className="font-display text-display-base font-extrabold uppercase tracking-tight text-electric">
            + Add open play block
          </p>
          <p className="mt-1 text-sm text-white/70">
            Pick a time, others can join. Defaults to 2 hours.
          </p>
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-electric/40 bg-electric/5 px-5 py-4 text-center">
          <p className="text-sm text-white/80">
            <Link href={signInHref} className="text-electric hover:underline font-bold">
              Sign in
            </Link>{" "}
            to create or join open play blocks. We&apos;ll bring you right
            back here.
          </p>
        </div>
      )}

      {/* Calendar grid */}
      <section className="mt-6">
        {loading ? (
          <p className="py-8 text-center text-sm text-white/40 animate-pulse">
            Loading...
          </p>
        ) : openBlocks.length === 0 && cancelled.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-white/50">
            No games scheduled at {courtName} yet. Be the first to add a
            block — anyone in the area will see it.
          </div>
        ) : (
          <>
            <WeekCalendar
              blocks={blocks}
              timezone={timezone}
              selectedBlockId={expandedId}
              onSelectBlock={setExpandedId}
            />

            {/* Expanded block details panel */}
            {expandedId && (() => {
              const b = blocks.find((x) => x.id === expandedId);
              if (!b) return null;
              return (
                <div className="mt-4">
                  <BlockCard
                    block={b}
                    timezone={timezone}
                    currentPlayerId={currentPlayerId}
                    isExpanded
                    onToggleExpand={() => setExpandedId(null)}
                    onJoin={() => handleJoin(b.id)}
                    onLeave={() => handleLeave(b.id)}
                    onCancel={() => handleCancel(b.id)}
                    onInvite={() => setInvitingBlockId(b.id)}
                    busy={busy === b.id}
                  />
                </div>
              );
            })()}
          </>
        )}
      </section>

      {creating && currentPlayerId && (
        <CreateBlockSheet
          courtId={courtId}
          createdBy={currentPlayerId}
          createdByName={currentPlayerName ?? "you"}
          timezone={timezone}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}

      {invitingBlockId &&
        currentPlayerId &&
        (() => {
          const inviteBlock = blocks.find((b) => b.id === invitingBlockId);
          if (!inviteBlock) return null;
          const dayLabel = new Date(
            inviteBlock.starts_at,
          ).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: timezone,
          });
          return (
            <InviteToBlockSheet
              blockId={inviteBlock.id}
              inviterPlayerId={currentPlayerId}
              inviterName={currentPlayerName ?? "Friend"}
              blockTimeRange={formatBlockTimeRange(inviteBlock, timezone)}
              blockDayLabel={dayLabel}
              courtName={courtName}
              excludePlayerIds={inviteBlock.attendees.map(
                (a) => a.player_id,
              )}
              onClose={() => setInvitingBlockId(null)}
              onInvited={refresh}
            />
          );
        })()}
    </div>
  );
}

// =============================================================
// Block card
// =============================================================
function BlockCard({
  block,
  timezone,
  currentPlayerId,
  isExpanded,
  onToggleExpand,
  onJoin,
  onLeave,
  onCancel,
  onInvite,
  busy,
}: {
  block: BlockWithAttendees;
  timezone: string;
  currentPlayerId: string | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onCancel: () => void;
  onInvite: () => void;
  busy: boolean;
}) {
  const youAreIn = currentPlayerId
    ? block.attendees.some((a) => a.player_id === currentPlayerId)
    : false;
  const youAreCreator = currentPlayerId === block.created_by;
  const previewCount = 6;
  const preview = block.attendees.slice(0, previewCount);
  const overflow = block.attendees.length - previewCount;

  return (
    <li className="rounded-2xl border-2 border-electric/40 bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-display-base font-extrabold text-white">
            {formatBlockTimeRange(block, timezone)}
          </p>
          <p className="mt-0.5 font-mono text-xs uppercase tracking-wider text-electric">
            {block.attendees.length} going
          </p>
        </div>

        {currentPlayerId &&
          (youAreIn ? (
            <button
              type="button"
              onClick={onLeave}
              disabled={busy}
              className="rounded-lg border-2 border-pickle px-4 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black disabled:opacity-50"
            >
              Leave
            </button>
          ) : (
            <button
              type="button"
              onClick={onJoin}
              disabled={busy}
              className="rounded-lg bg-electric px-5 py-1.5 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:opacity-90 disabled:opacity-50"
            >
              Join
            </button>
          ))}
      </div>

      {block.notes && (
        <p className="mt-2 text-sm text-white/70">{block.notes}</p>
      )}

      {/* Attendees preview row */}
      {preview.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {preview.map((a) => (
            <Link
              key={a.player_id}
              href={`/profile/${a.player_id}`}
              title={a.display_name}
            >
              <Avatar
                player={{
                  display_name: a.display_name,
                  avatar_url: a.avatar_url,
                  avatar_focal_x: a.avatar_focal_x,
                  avatar_focal_y: a.avatar_focal_y,
                  is_guest: a.is_guest,
                }}
                size="sm"
              />
            </Link>
          ))}
          {overflow > 0 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-electric font-mono text-xs font-bold text-electric hover:bg-electric hover:text-black"
              aria-label={`Show all ${block.attendees.length} attendees`}
            >
              +{overflow}
            </button>
          )}
        </div>
      )}

      {/* Toggle expand + invite */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="font-display text-display-xs uppercase font-bold tracking-wide text-white/50 hover:text-electric"
        >
          {isExpanded ? "− Hide details" : "+ See all attendees"}
        </button>
        {currentPlayerId && (
          <button
            type="button"
            onClick={onInvite}
            className="font-display text-display-xs uppercase font-bold tracking-wide text-electric hover:text-bright"
          >
            ＋ Invite friends
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {block.attendees.length === 0 ? (
            <p className="text-sm text-white/40">No one yet — be the first.</p>
          ) : (
            <ul className="space-y-1.5">
              {block.attendees.map((a) => (
                <li key={a.player_id}>
                  <Link
                    href={`/profile/${a.player_id}`}
                    className="flex items-center gap-2 rounded-lg p-1.5 transition hover:bg-white/5"
                  >
                    <Avatar
                      player={{
                        display_name: a.display_name,
                        avatar_url: a.avatar_url,
                        avatar_focal_x: a.avatar_focal_x,
                        avatar_focal_y: a.avatar_focal_y,
                        is_guest: a.is_guest,
                      }}
                      size="xs"
                    />
                    <span className="text-sm text-white">
                      {a.display_name}
                      {a.username && (
                        <span className="ml-1 font-mono text-xs text-white/50">
                          @{a.username}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {youAreCreator && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-md border border-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black disabled:opacity-50"
              >
                Cancel block
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// =============================================================
// Create block sheet (bottom sheet on mobile, centered modal on desktop)
// =============================================================
function CreateBlockSheet({
  courtId,
  createdBy,
  createdByName,
  timezone,
  onClose,
  onCreated,
}: {
  courtId: string;
  createdBy: string;
  createdByName: string;
  timezone: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  // Default start = next round hour after now (in court timezone for display,
  // but the actual ISO string is UTC of course)
  const initial = nextRoundHour();
  const [date, setDate] = useState<string>(initial.dateLocal);
  const [time, setTime] = useState<string>(initial.timeLocal);
  const [duration, setDuration] = useState<number>(120); // minutes
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // Parse the local date/time as if it's in the LOGGER's local timezone.
      // (We could parse in court timezone but that makes the date/time picker
      // confusing — keep it as the user's local time and let the display layer
      // re-format in the court's timezone. Most loggers will be local to the
      // court anyway.)
      const startsAt = new Date(`${date}T${time}:00`);
      if (isNaN(startsAt.getTime())) {
        throw new Error("Pick a valid start time");
      }
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);

      await createBlock({
        courtId,
        createdBy,
        startsAt,
        endsAt,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create block");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t-2 border-x-2 border-electric bg-black p-5 shadow-2xl
          sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-2"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-display-base font-extrabold uppercase tracking-tight text-electric">
            New open play block
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 font-mono text-base text-white/60 hover:border-electric hover:text-electric"
          >
            ×
          </button>
        </div>

        <p className="mb-4 text-xs text-white/60">
          You&apos;ll be auto-joined as the first attendee. Times shown in
          your local timezone; the block displays in the court&apos;s timezone
          ({timezone}) for everyone else.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-display text-display-xs uppercase font-bold tracking-wide text-electric">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-base text-white focus:border-electric focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-display text-display-xs uppercase font-bold tracking-wide text-electric">
                Start time
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-base text-white focus:border-electric focus:outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-display text-display-xs uppercase font-bold tracking-wide text-electric">
              Duration
            </span>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-base text-white focus:border-electric focus:outline-none"
            >
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours (default)</option>
              <option value={180}>3 hours</option>
              <option value={240}>4 hours</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-display-xs uppercase font-bold tracking-wide text-electric">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="e.g. Level 3.5+ welcome, bring outdoor balls"
              className="rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-base text-white placeholder:text-white/30 focus:border-electric focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-electric px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : `Create as ${createdByName}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border-2 border-white/30 px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-white/70 hover:border-electric hover:text-electric"
            >
              Cancel
            </button>
          </div>
          {err && <p className="text-sm text-bright">⚠ {err}</p>}
        </form>
      </div>
    </>
  );
}

// =============================================================
// Helpers
// =============================================================
function nextRoundHour(): { dateLocal: string; timeLocal: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // Format as YYYY-MM-DD and HH:MM in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return {
    dateLocal: `${yyyy}-${mm}-${dd}`,
    timeLocal: `${hh}:${mi}`,
  };
}
