"use client";

import { useState } from "react";
import {
  type LeagueMatch,
  type LeagueRound,
  type LeaguePlayer,
  saveMatchScore,
} from "@/lib/leagues";

interface Props {
  rounds: LeagueRound[];
  matches: LeagueMatch[];
  players: LeaguePlayer[];
  currentSession: number;
  currentRound: number;
  isAdmin: boolean;
  /** Show all rounds (true) or only completed ones excluding the current
   *  in-progress round (false). Use true for finished leagues. */
  includeCurrent?: boolean;
  onChanged: () => Promise<void>;
}

/**
 * Lists every completed round so the admin can spot-fix a wrong score
 * after the fact. Each edit is logged to league_match_edits and shown
 * as "edited X ago by Y" so there's no mystery about what changed.
 *
 * Editing a past score updates standings immediately (computeStandings
 * is a function of the current matches table) but does NOT cascade --
 * the court-movement decisions from later rounds stay as-played.
 */
export default function PastRoundsPanel({
  rounds,
  matches,
  players,
  currentSession,
  currentRound,
  isAdmin,
  includeCurrent = false,
  onChanged,
}: Props) {
  const visibleRounds = rounds
    .filter((r) => {
      if (includeCurrent) return true;
      // Exclude the active round
      return !(
        r.session_number === currentSession &&
        r.round_number === currentRound
      );
    })
    .sort((a, b) => {
      if (a.session_number !== b.session_number)
        return a.session_number - b.session_number;
      return a.round_number - b.round_number;
    });

  if (visibleRounds.length === 0) return null;

  const playerName = (id: string) =>
    players.find((p) => p.player_id === id)?.display_name ?? "Player";

  return (
    <div>
      <h2 className="font-display text-display-base font-bold text-white">
        Past rounds {isAdmin && <span className="text-xs font-normal text-white/50">— click ✎ to fix a score</span>}
      </h2>
      <div className="mt-3 space-y-2">
        {visibleRounds.map((r) => {
          const roundMatches = matches
            .filter((m) => m.round_id === r.id)
            .sort((a, b) => a.court_number - b.court_number);
          return (
            <RoundRow
              key={r.id}
              round={r}
              matches={roundMatches}
              playerName={playerName}
              isAdmin={isAdmin}
              showSession={
                rounds.some((rr) => rr.session_number !== rounds[0].session_number)
              }
              onChanged={onChanged}
            />
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// One collapsible round
// =====================================================================
function RoundRow({
  round,
  matches,
  playerName,
  isAdmin,
  showSession,
  onChanged,
}: {
  round: LeagueRound;
  matches: LeagueMatch[];
  playerName: (id: string) => string;
  isAdmin: boolean;
  showSession: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const allScored =
    matches.length > 0 &&
    matches.every((m) => m.team_a_score !== null && m.team_b_score !== null);

  return (
    <div className="rounded-xl border-2 border-pickle/30 bg-pickle/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
          {showSession && `S${round.session_number} · `}Round {round.round_number}
          {!allScored && (
            <span className="ml-2 text-bright">incomplete</span>
          )}
        </span>
        <span className="text-sm text-white/60">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="border-t-2 border-pickle/20 px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              {matches.map((m) => (
                <CourtRow
                  key={m.id}
                  match={m}
                  playerName={playerName}
                  isAdmin={isAdmin}
                  onChanged={onChanged}
                />
              ))}
            </tbody>
          </table>
          {round.byes.length > 0 && (
            <p className="mt-2 text-xs text-white/50">
              On bye: {round.byes.map(playerName).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// One court row (with inline edit)
// =====================================================================
function CourtRow({
  match,
  playerName,
  isAdmin,
  onChanged,
}: {
  match: LeagueMatch;
  playerName: (id: string) => string;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState<string>(
    match.team_a_score !== null ? String(match.team_a_score) : "",
  );
  const [b, setB] = useState<string>(
    match.team_b_score !== null ? String(match.team_b_score) : "",
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const aN = parseInt(a, 10);
    const bN = parseInt(b, 10);
    if (Number.isNaN(aN) || Number.isNaN(bN)) {
      setErr("Both scores must be numbers");
      return;
    }
    if (aN === bN) {
      setErr("Pickleball can't tie");
      return;
    }
    setSaving(true);
    try {
      await saveMatchScore(match.id, aN, bN);
      await onChanged();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setA(match.team_a_score !== null ? String(match.team_a_score) : "");
    setB(match.team_b_score !== null ? String(match.team_b_score) : "");
    setErr(null);
    setEditing(false);
  }

  return (
    <tr className="border-t border-white/10 align-top">
      <td className="py-2 pr-3 font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
        Court {match.court_number}
      </td>
      <td className="py-2">
        <div className={match.winner === "a" ? "font-bold text-white" : "text-white/85"}>
          {playerName(match.team_a_p1)} + {playerName(match.team_a_p2)}
        </div>
        <div className="mt-1 text-xs text-white/40">vs</div>
        <div className={match.winner === "b" ? "font-bold text-white" : "text-white/85"}>
          {playerName(match.team_b_p1)} + {playerName(match.team_b_p2)}
        </div>
        {match.last_edited_at && (
          <div className="mt-1 text-[10px] uppercase tracking-wide text-bright/70">
            ✎ edited {timeAgo(match.last_edited_at)}
          </div>
        )}
      </td>
      <td className="py-2 px-2 text-right" style={{ minWidth: 110 }}>
        {editing ? (
          <div className="flex flex-col gap-1">
            <input
              type="number"
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="w-16 rounded border-2 border-white bg-black px-2 py-1 text-right font-mono text-base text-white focus:border-pickle focus:outline-none"
              disabled={saving}
            />
            <input
              type="number"
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="w-16 rounded border-2 border-white bg-black px-2 py-1 text-right font-mono text-base text-white focus:border-pickle focus:outline-none"
              disabled={saving}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="font-mono text-base text-white">
              {match.team_a_score ?? "–"}
            </span>
            <span className="mt-1 font-mono text-base text-white">
              {match.team_b_score ?? "–"}
            </span>
          </div>
        )}
      </td>
      <td className="py-2 pl-2 text-right">
        {isAdmin &&
          (editing ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded bg-pickle px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-black hover:bg-bright disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="rounded border-2 border-white/30 px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-white/70 hover:border-bright hover:text-bright"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border-2 border-pickle/40 px-2 py-1 text-xs text-pickle hover:bg-pickle hover:text-black"
              aria-label="Edit scores"
            >
              ✎
            </button>
          ))}
        {err && <p className="mt-1 text-[10px] text-bright">⚠ {err}</p>}
      </td>
    </tr>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
