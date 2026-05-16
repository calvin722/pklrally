"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type League,
  type LeagueState,
  type LeagueMatch,
  fetchLeagueState,
  saveMatchScore,
  advanceRound,
} from "@/lib/leagues";

/** Label for the "advance round" button — handles session transitions. */
function advanceLabel(league: League): string {
  const atSessionEnd = league.current_round >= league.n_rounds;
  const atFinalSession = league.current_session >= league.n_sessions;
  if (atSessionEnd && atFinalSession) return "Save & Finish League →";
  if (atSessionEnd)
    return `Save & Start Session ${league.current_session + 1} →`;
  return `Save Round & Generate Round ${league.current_round + 1} →`;
}

interface Props {
  leagueId: string;
}

export default function ScoreEntry({ leagueId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<LeagueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchLeagueState(leagueId);
    setState(s);
    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !state) {
    return <div className="mt-10 text-white/50">Loading…</div>;
  }

  const { league, players, rounds, matches } = state;
  const current = rounds.find(
    (r) =>
      r.session_number === league.current_session &&
      r.round_number === league.current_round,
  );
  if (!current) return <div className="mt-10 text-bright">No active round.</div>;
  const currentMatches = matches
    .filter((m) => m.round_id === current.id)
    .sort((a, b) => a.court_number - b.court_number);
  const playerName = (id: string) =>
    players.find((p) => p.player_id === id)?.display_name ?? "Player";

  const allScored =
    currentMatches.length > 0 &&
    currentMatches.every((m) => m.team_a_score !== null && m.team_b_score !== null);

  async function handleAdvance() {
    setBusy(true);
    setError(null);
    try {
      await advanceRound(leagueId);
      router.push(`/leagues/${leagueId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not advance round");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {currentMatches.map((m) => (
        <CourtScoreCard
          key={m.id}
          match={m}
          playerName={playerName}
          isKing={m.court_number === 1}
          onSaved={refresh}
        />
      ))}

      {current.byes.length > 0 && (
        <div className="rounded-lg border-2 border-white/20 bg-white/5 px-4 py-3 text-sm">
          <div className="font-display text-display-xs uppercase font-bold tracking-wide text-white/60">
            On bye this round
          </div>
          <div className="mt-1 text-white/80">{current.byes.map(playerName).join(", ")}</div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border-2 border-bright bg-bright/10 px-4 py-3 text-sm text-bright">
          ⚠ {error}
        </p>
      )}

      <div className="sticky bottom-4 mt-6 rounded-2xl border-2 border-pickle bg-black/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={handleAdvance}
          disabled={!allScored || busy}
          className="w-full rounded-lg bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black transition hover:bg-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!allScored
            ? `Enter scores for all ${currentMatches.length} courts to continue`
            : busy
              ? "Saving…"
              : advanceLabel(league)}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Per-court score card
// ----------------------------------------------------------------
function CourtScoreCard({
  match,
  playerName,
  isKing,
  onSaved,
}: {
  match: LeagueMatch;
  playerName: (id: string) => string;
  isKing: boolean;
  onSaved: () => Promise<void>;
}) {
  const [scoreA, setScoreA] = useState<string>(
    match.team_a_score !== null ? String(match.team_a_score) : "",
  );
  const [scoreB, setScoreB] = useState<string>(
    match.team_b_score !== null ? String(match.team_b_score) : "",
  );
  const [editing, setEditing] = useState(
    match.team_a_score === null && match.team_b_score === null,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const savedScore = match.team_a_score !== null && match.team_b_score !== null;

  async function save() {
    setErr(null);
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      setErr("Enter a number for both teams");
      return;
    }
    if (a === b) {
      setErr("Games can't tie — one team must win");
      return;
    }
    setSaving(true);
    try {
      await saveMatchScore(match.id, a, b);
      await onSaved();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 px-4 py-4 ${
        isKing ? "border-bright bg-bright/5" : "border-pickle/40 bg-pickle/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="font-display text-display-sm font-extrabold uppercase tracking-wide text-pickle">
          Court {match.court_number} {isKing && "👑"}
        </div>
        {savedScore && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border-2 border-white/30 px-3 py-1 text-xs text-white/70 transition hover:border-pickle hover:text-pickle"
          >
            ✎ Edit
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Team A */}
        <div>
          <div
            className={`text-sm leading-tight ${
              match.winner === "a" ? "font-bold text-white" : "text-white/90"
            }`}
          >
            {playerName(match.team_a_p1)}
            <br />
            {playerName(match.team_a_p2)}
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            disabled={!editing || saving}
            className="mt-2 w-full rounded-lg border-2 border-white bg-black px-3 py-3 text-center font-mono text-2xl font-bold text-pickle placeholder:text-white/30 focus:border-pickle focus:outline-none disabled:opacity-60"
            placeholder="–"
          />
        </div>

        <div className="font-display text-display-xs text-white/40">vs</div>

        {/* Team B */}
        <div>
          <div
            className={`text-sm leading-tight ${
              match.winner === "b" ? "font-bold text-white" : "text-white/90"
            }`}
          >
            {playerName(match.team_b_p1)}
            <br />
            {playerName(match.team_b_p2)}
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            disabled={!editing || saving}
            className="mt-2 w-full rounded-lg border-2 border-white bg-black px-3 py-3 text-center font-mono text-2xl font-bold text-pickle placeholder:text-white/30 focus:border-pickle focus:outline-none disabled:opacity-60"
            placeholder="–"
          />
        </div>
      </div>

      {err && <p className="mt-2 text-xs text-bright">⚠ {err}</p>}

      {editing && (
        <div className="mt-3 flex justify-end gap-2">
          {savedScore && (
            <button
              type="button"
              onClick={() => {
                setScoreA(String(match.team_a_score));
                setScoreB(String(match.team_b_score));
                setErr(null);
                setEditing(false);
              }}
              disabled={saving}
              className="rounded-lg border-2 border-white/30 px-4 py-2 text-xs text-white/70 hover:border-bright hover:text-bright"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-pickle px-5 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black transition hover:bg-bright disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
