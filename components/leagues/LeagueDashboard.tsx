"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  type LeagueState,
  type LeagueMatch,
  type LeagueRound,
  type LeaguePrize,
  type Standing,
  fetchLeagueState,
  addOrInvitePlayer,
  removeLeaguePlayer,
  generateRound1,
  advanceRound,
  finalizeLeague,
  deleteLeague,
  formatLeagueDateTime,
  DEFAULT_LEAGUE_TZ,
  sendLeagueCompletionEmails,
} from "@/lib/leagues";
import { searchPlayers } from "@/lib/rally";
import { createClient } from "@/lib/supabase/client";
import InvitePanel from "./InvitePanel";

interface Props {
  leagueId: string;
  isAdmin: boolean;
  currentPlayerId: string | null;
}

export default function LeagueDashboard({
  leagueId,
  isAdmin,
  currentPlayerId,
}: Props) {
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

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="mt-10 text-white/50">Loading league…</div>;
  }
  if (!state) {
    return <div className="mt-10 text-bright">League not found.</div>;
  }

  const { league, players, rounds, matches, standings, prizes } = state;
  const minPlayers = league.n_courts * 4;
  const ready = players.length >= minPlayers;

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            {league.name}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {league.n_courts} courts &middot; {league.n_rounds} rounds &middot;{" "}
            +{league.win_bonus} win bonus
            {league.court_rules ? ` · "${league.court_rules}"` : ""}
          </p>
          {league.status !== "setup" && (
            <Link
              href={`/leagues/${league.id}/stats`}
              className="mt-2 inline-flex items-center gap-1 text-xs text-pickle hover:underline"
            >
              📊 View per-player charts →
            </Link>
          )}
        </div>
        <StatusPill status={league.status} round={league.current_round} total={league.n_rounds} />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border-2 border-bright bg-bright/10 px-4 py-3 text-sm text-bright">
          ⚠ {error}
        </p>
      )}

      {/* Meta — description, date/court, prizes teaser */}
      <LeagueMeta league={league} prizes={prizes} />

      {/* Invite panel — admin only, visible in setup + in_progress states */}
      {isAdmin && currentPlayerId && league.status !== "finished" && (
        <div className="mt-6">
          <InvitePanel leagueId={leagueId} invitedBy={currentPlayerId} />
        </div>
      )}

      {/* Body: switch on status */}
      <div className="mt-8">
        {league.status === "setup" && (
          <SetupPanel
            leagueId={leagueId}
            leagueName={league.name}
            currentPlayerId={currentPlayerId}
            players={players}
            minPlayers={minPlayers}
            ready={ready}
            isAdmin={isAdmin}
            busy={busy}
            onAdded={refresh}
            onStart={() => run(() => generateRound1(leagueId))}
            onDelete={() => {
              if (confirm("Delete this league? This cannot be undone."))
                run(async () => {
                  await deleteLeague(leagueId);
                  window.location.href = "/leagues";
                });
            }}
          />
        )}

        {league.status === "in_progress" && (
          <InProgressPanel
            league={league}
            players={players}
            rounds={rounds}
            matches={matches}
            standings={standings}
            prizes={prizes}
            isAdmin={isAdmin}
            busy={busy}
            onAdvance={() => run(() => advanceRound(leagueId))}
            onFinalize={() => {
              if (confirm("End the league now? This finalizes standings."))
                run(() => finalizeLeague(leagueId));
            }}
          />
        )}

        {league.status === "finished" && (
          <FinishedPanel
            leagueId={leagueId}
            standings={standings}
            rounds={rounds}
            matches={matches}
            players={players}
            prizes={prizes}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
}

// ===================================================================
// Status pill
// ===================================================================
function StatusPill({
  status,
  round,
  total,
}: {
  status: string;
  round: number;
  total: number;
}) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    setup: { label: "Setup", bg: "bg-white/10", fg: "text-white" },
    in_progress: { label: `Round ${round} of ${total}`, bg: "bg-pickle", fg: "text-black" },
    finished: { label: "Finished", bg: "bg-bright", fg: "text-black" },
    cancelled: { label: "Cancelled", bg: "bg-white/20", fg: "text-white/60" },
  };
  const m = map[status] ?? map.setup;
  return (
    <span
      className={`rounded-full px-4 py-1.5 font-display text-display-xs uppercase font-bold tracking-wide ${m.bg} ${m.fg}`}
    >
      {m.label}
    </span>
  );
}

// ===================================================================
// SETUP — add players, start league
// ===================================================================
function SetupPanel({
  leagueId,
  leagueName,
  currentPlayerId,
  players,
  minPlayers,
  ready,
  isAdmin,
  busy,
  onAdded,
  onStart,
  onDelete,
}: {
  leagueId: string;
  leagueName: string;
  currentPlayerId: string | null;
  players: LeagueState["players"];
  minPlayers: number;
  ready: boolean;
  isAdmin: boolean;
  busy: boolean;
  onAdded: () => Promise<void>;
  onStart: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="space-y-8">
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-pickle/40 bg-pickle/5 px-4 py-3">
          <p className="text-sm text-white/80">
            <strong className="text-pickle">Editable until you start.</strong>{" "}
            Change the name, date, courts, prizes — anything — up until the
            Start League button is pressed.
          </p>
          <Link
            href={`/leagues/${leagueId}/edit`}
            className="rounded-lg border-2 border-pickle px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-pickle transition hover:bg-pickle hover:text-black"
          >
            ✎ Edit details
          </Link>
        </div>
      )}

      {isAdmin && currentPlayerId && (
        <AddPlayerForm
          leagueId={leagueId}
          invitedBy={currentPlayerId}
          onAdded={onAdded}
        />
      )}

      <div>
        <h2 className="font-display text-display-base font-bold text-white">
          Players ({players.length}
          {minPlayers > 0 ? ` of ${minPlayers}+` : ""})
        </h2>
        <p className="mt-1 text-xs text-white/50">
          Need {minPlayers} to fill {minPlayers / 4} courts. More is fine — extras
          rotate through byes.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-pickle">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-pickle text-black">
              <tr>
                <th className="px-3 py-2 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
                  #
                </th>
                <th className="px-3 py-2 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
                  Name
                </th>
                {isAdmin && (
                  <th className="px-3 py-2 text-right font-display text-display-xs uppercase font-extrabold tracking-wide">
                    {""}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 3 : 2} className="px-4 py-8 text-center text-white/50">
                    No players yet — add some above.
                  </td>
                </tr>
              )}
              {players.map((p, i) => (
                <tr key={p.player_id} className="border-t-2 border-pickle/30">
                  <td className="px-3 py-2 font-mono text-xs text-white/60">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="text-white">{p.display_name}</span>
                    {p.is_guest && (
                      <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                        guest
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <RemoveButton leagueId={leagueId} playerId={p.player_id} onDone={onAdded} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy || !ready}
            className="rounded-lg bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black transition hover:bg-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Starting…" : "Start League → Generate Round 1"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg border-2 border-white/40 px-6 py-4 font-display text-display-xs font-bold uppercase tracking-wide text-white/70 transition hover:border-bright hover:text-bright"
          >
            Delete League
          </button>
        </div>
      )}

      <StartConfirmModal
        open={confirmOpen}
        leagueName={leagueName}
        playerCount={players.length}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onStart();
        }}
      />
    </div>
  );
}

// -------- Start confirmation modal --------
function StartConfirmModal({
  open,
  leagueName,
  playerCount,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leagueName: string;
  playerCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-bright bg-black p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
          ⚠ Final check
        </div>
        <h2 className="mt-1 font-display text-display-xl font-extrabold text-bright">
          Start {leagueName}?
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/85">
          <p>
            Once you start the league, <strong>no going back</strong>:
          </p>
          <ul className="space-y-1.5 pl-5 text-white/80">
            <li className="list-disc">
              League details (name, dates, courts, prizes) <strong>lock</strong>
            </li>
            <li className="list-disc">
              Round 1 generates with the {playerCount} players currently on the roster
            </li>
            <li className="list-disc">
              You&rsquo;ll start entering scores after the first round
            </li>
          </ul>
          <p className="text-white/70">
            Make sure your roster and details are correct — once started, you
            can&rsquo;t add or remove players from the round assignments.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border-2 border-white/40 px-6 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-white/80 transition hover:border-white hover:text-white disabled:opacity-50"
          >
            Cancel — keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-bright px-6 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-pickle disabled:opacity-50"
          >
            {busy ? "Starting…" : "Yes, start the league →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveButton({
  leagueId,
  playerId,
  onDone,
}: {
  leagueId: string;
  playerId: string;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await removeLeaguePlayer(leagueId, playerId);
      await onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="text-xs text-white/40 hover:text-bright"
    >
      remove
    </button>
  );
}

// ---- Add player form (typeahead + add-by-contact) ----
function AddPlayerForm({
  leagueId,
  invitedBy,
  onAdded,
}: {
  leagueId: string;
  invitedBy: string;
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; display_name: string; email: string | null }>
  >([]);
  const [adding, setAdding] = useState(false);
  const [lastClaimUrl, setLastClaimUrl] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await searchPlayers(q, 6);
      if (!cancelled) setResults(data);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function addExisting(playerId: string, displayName: string) {
    setAdding(true);
    setErrorMsg(null);
    setLastClaimUrl(null);
    setLastNote(null);
    try {
      const res = await addOrInvitePlayer({ leagueId, invitedBy, playerId });
      setQuery("");
      setResults([]);
      setLastClaimUrl(res.claimUrl);
      if (res.emailedTo) {
        setLastNote(`✓ Invite emailed to ${res.emailedTo} — pending their reply.`);
      } else {
        setLastNote(
          `✓ ${displayName} added directly (no email on file). They won't get a notification.`,
        );
      }
      await onAdded();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : `Could not add ${displayName}`);
    } finally {
      setAdding(false);
    }
  }

  async function addNew() {
    const name = query.trim();
    if (!name) return;
    setAdding(true);
    setErrorMsg(null);
    setLastClaimUrl(null);
    setLastNote(null);
    try {
      const res = await addOrInvitePlayer({
        leagueId,
        invitedBy,
        displayName: name,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setQuery("");
      setEmail("");
      setPhone("");
      setResults([]);
      setLastClaimUrl(res.claimUrl);
      if (res.emailedTo) {
        setLastNote(`✓ Invite emailed to ${res.emailedTo} — pending their reply.`);
      } else if (res.claimUrl) {
        setLastNote(`✓ ${name} added. Text them the claim link below.`);
      } else {
        setLastNote(`✓ ${name} added directly (no contact info).`);
      }
      await onAdded();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-5">
      <h3 className="font-display text-display-sm font-bold text-pickle">
        Add player
      </h3>
      <p className="mt-1 text-xs text-white/60">
        Type a name. Players with an email on file get an invite email
        with accept / decline buttons — they appear on the roster after
        they accept. No email → added directly.
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Player name"
        className="mt-3 w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
        disabled={adding}
      />

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-white/10 rounded-lg border-2 border-white/30 bg-black">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => addExisting(r.id, r.display_name)}
                disabled={adding}
                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-white hover:bg-pickle/10"
              >
                <span>{r.display_name}</span>
                <span className="text-xs text-white/40">
                  {r.email ? "→ invite email" : "→ direct add"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && results.length === 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-white/60">No matching member — add as a new guest:</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              className="rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
              disabled={adding}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
              disabled={adding}
            />
          </div>
          <button
            type="button"
            onClick={addNew}
            disabled={adding}
            className="w-full rounded-lg bg-pickle px-4 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-black transition hover:bg-bright disabled:opacity-50"
          >
            {adding ? "Adding…" : `+ Add "${query.trim()}"`}
          </button>
        </div>
      )}

      {lastNote && (
        <p className="mt-3 text-xs text-pickle">{lastNote}</p>
      )}

      {lastClaimUrl && (
        <div className="mt-3 rounded-lg border-2 border-bright bg-bright/10 px-3 py-2 text-xs text-white">
          <div className="font-bold text-bright">Claim link (text this to them):</div>
          <a
            href={lastClaimUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-pickle underline"
          >
            {lastClaimUrl}
          </a>
          <div className="mt-1 text-white/60">
            Lets them claim their stats after the league.
          </div>
        </div>
      )}

      {errorMsg && (
        <p className="mt-3 text-sm text-bright">⚠ {errorMsg}</p>
      )}
    </div>
  );
}

// ===================================================================
// IN-PROGRESS — current round + standings
// ===================================================================
function InProgressPanel({
  league,
  players,
  rounds,
  matches,
  standings,
  prizes,
  isAdmin,
  busy,
  onAdvance,
  onFinalize,
}: {
  league: LeagueState["league"];
  players: LeagueState["players"];
  rounds: LeagueRound[];
  matches: LeagueMatch[];
  standings: Standing[];
  prizes: LeaguePrize[];
  isAdmin: boolean;
  busy: boolean;
  onAdvance: () => void;
  onFinalize: () => void;
}) {
  const current = rounds.find(
    (r) =>
      r.session_number === league.current_session &&
      r.round_number === league.current_round,
  );
  const currentMatches = matches.filter((m) => current && m.round_id === current.id);
  const allScored =
    currentMatches.length > 0 &&
    currentMatches.every((m) => m.team_a_score !== null && m.team_b_score !== null);
  const playerName = (id: string) =>
    players.find((p) => p.player_id === id)?.display_name ?? "Player";

  return (
    <div className="space-y-8">
      {current && (
        <div>
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-display-base font-bold text-white">
              {league.n_sessions > 1 && (
                <>
                  Session {current.session_number} of {league.n_sessions} ·{" "}
                </>
              )}
              Round {current.round_number} of {league.n_rounds}
            </h2>
            {isAdmin && (
              <Link
                href={`/leagues/${league.id}/scores`}
                className="rounded-lg bg-pickle px-5 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-bright"
              >
                {allScored ? "Review / Edit Scores →" : "Enter Scores →"}
              </Link>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {currentMatches.map((m) => (
              <CourtPreviewCard
                key={m.id}
                m={m}
                playerName={playerName}
                isKing={m.court_number === 1}
              />
            ))}
          </div>

          {current.byes.length > 0 && (
            <div className="mt-4 rounded-lg border-2 border-white/20 bg-white/5 px-4 py-3 text-sm">
              <div className="font-display text-display-xs uppercase font-bold tracking-wide text-white/60">
                On bye this round
              </div>
              <div className="mt-1 text-white">
                {current.byes.map(playerName).join(", ")}
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onAdvance}
                disabled={busy || !allScored}
                className="rounded-lg bg-pickle px-6 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                {(() => {
                  const atSessionEnd = league.current_round >= league.n_rounds;
                  const atFinalSession =
                    league.current_session >= league.n_sessions;
                  if (atSessionEnd && atFinalSession)
                    return "Save & Finish League";
                  if (atSessionEnd)
                    return `Save & Start Session ${league.current_session + 1}`;
                  return `Save Round & Generate Round ${league.current_round + 1}`;
                })()}
              </button>
              <button
                type="button"
                onClick={onFinalize}
                disabled={busy}
                className="rounded-lg border-2 border-white/40 px-6 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-white/70 transition hover:border-bright hover:text-bright"
              >
                End League Now
              </button>
            </div>
          )}
        </div>
      )}

      {prizes.length > 0 && <PrizeShowcase prizes={prizes} compact />}
      <StandingsTable standings={standings} />
    </div>
  );
}

function CourtPreviewCard({
  m,
  playerName,
  isKing,
}: {
  m: LeagueMatch;
  playerName: (id: string) => string;
  isKing: boolean;
}) {
  const scored = m.team_a_score !== null && m.team_b_score !== null;
  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 ${
        isKing ? "border-bright bg-bright/5" : "border-pickle/40 bg-pickle/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
          Court {m.court_number} {isKing && "👑"}
        </div>
        {scored && (
          <div className="font-mono text-xs text-white/60">
            {m.team_a_score} — {m.team_b_score}
          </div>
        )}
      </div>
      <div className="mt-2 text-sm">
        <div className={m.winner === "a" ? "font-bold text-white" : "text-white/80"}>
          {playerName(m.team_a_p1)} + {playerName(m.team_a_p2)}
        </div>
        <div className="my-1 text-xs text-white/40">vs</div>
        <div className={m.winner === "b" ? "font-bold text-white" : "text-white/80"}>
          {playerName(m.team_b_p1)} + {playerName(m.team_b_p2)}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// FINISHED
// ===================================================================
function FinishedPanel({
  leagueId,
  standings,
  prizes,
  isAdmin,
}: {
  leagueId: string;
  standings: Standing[];
  rounds: LeagueRound[];
  matches: LeagueMatch[];
  players: LeagueState["players"];
  prizes: LeaguePrize[];
  isAdmin: boolean;
}) {
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    setResending(true);
    setResendNote(null);
    setResendError(null);
    try {
      const res = await sendLeagueCompletionEmails(leagueId);
      setResendNote(
        `✓ Sent to ${res.sent} player${res.sent === 1 ? "" : "s"}${
          res.failed > 0 ? ` (${res.failed} failed)` : ""
        }.`,
      );
    } catch (e) {
      setResendError(
        e instanceof Error ? e.message : "Could not send results email",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-bright bg-bright/5 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
              League Complete 🏆
            </div>
            <div className="mt-1 text-white">
              {standings[0] ? (
                <>
                  <span className="font-display text-display-lg font-extrabold text-pickle">
                    {standings[0].display_name}
                  </span>{" "}
                  wins the league with{" "}
                  <span className="font-bold">
                    {standings[0].total_points} points
                  </span>
                  .
                </>
              ) : (
                <>No standings available.</>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="text-right">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="rounded-lg border-2 border-pickle px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-pickle transition hover:bg-pickle hover:text-black disabled:opacity-50"
              >
                {resending ? "Sending…" : "📧 Resend results email"}
              </button>
              {resendNote && (
                <p className="mt-1 text-xs text-pickle">{resendNote}</p>
              )}
              {resendError && (
                <p className="mt-1 text-xs text-bright">⚠ {resendError}</p>
              )}
            </div>
          )}
        </div>
      </div>
      {prizes.length > 0 && <PrizeShowcase prizes={prizes} winners={standings} />}
      <StandingsTable standings={standings} highlightTop3 />
    </div>
  );
}

// ===================================================================
// LeagueMeta — description, date, court
// ===================================================================
function LeagueMeta({
  league,
  prizes,
}: {
  league: LeagueState["league"];
  prizes: LeaguePrize[];
}) {
  const [courtLabel, setCourtLabel] = useState<string | null>(null);
  const [courtTz, setCourtTz] = useState<string>(DEFAULT_LEAGUE_TZ);

  useEffect(() => {
    if (!league.court_id) {
      setCourtLabel(null);
      setCourtTz(DEFAULT_LEAGUE_TZ);
      return;
    }
    const supabase = createClient();
    supabase
      .from("courts")
      .select("name, address, city, state, timezone")
      .eq("id", league.court_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const parts = [data.name, data.city && `${data.city}, ${data.state}`]
          .filter(Boolean)
          .join(" · ");
        setCourtLabel(parts);
        if (data.timezone) setCourtTz(data.timezone);
      });
  }, [league.court_id]);

  const dateLabel = league.scheduled_at
    ? formatLeagueDateTime(league.scheduled_at, courtTz)
    : null;

  const manual =
    league.manual_court_name || league.manual_court_address
      ? [league.manual_court_name, league.manual_court_address]
          .filter(Boolean)
          .join(" — ")
      : null;

  const hasAnyMeta =
    league.description ||
    dateLabel ||
    courtLabel ||
    manual ||
    prizes.length > 0;
  if (!hasAnyMeta) return null;

  return (
    <div className="mt-5 grid gap-3 rounded-2xl border-2 border-white/10 bg-white/[0.03] px-5 py-4 md:grid-cols-[1fr_auto]">
      <div className="space-y-2">
        {league.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">
            {league.description}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {dateLabel && (
            <span className="text-white/70">
              <span className="text-pickle">📅</span> {dateLabel}
            </span>
          )}
          {courtLabel && (
            <span className="text-white/70">
              <span className="text-pickle">📍</span> {courtLabel}
            </span>
          )}
          {manual && (
            <span className="text-white/70">
              <span className="text-pickle">📍</span> {manual}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// PrizeShowcase — shown on dashboard (compact) and final standings (big)
// ===================================================================
function PrizeShowcase({
  prizes,
  compact = false,
  winners,
}: {
  prizes: LeaguePrize[];
  compact?: boolean;
  winners?: Standing[];
}) {
  const sorted = [...prizes].sort((a, b) => a.place - b.place);
  const PLACE_LABELS: Record<number, string> = {
    1: "🥇 1st place",
    2: "🥈 2nd place",
    3: "🥉 3rd place",
  };
  return (
    <div>
      <h2 className="font-display text-display-base font-bold text-bright">
        {compact ? "Playing for" : "Prizes"}
      </h2>
      <div
        className={`mt-3 grid gap-3 ${
          compact ? "md:grid-cols-3" : "md:grid-cols-3"
        }`}
      >
        {sorted.map((p) => {
          const winner = winners?.[p.place - 1];
          return (
            <div
              key={p.id}
              className={`rounded-2xl border-2 px-4 py-3 ${
                p.place === 1
                  ? "border-bright bg-bright/5"
                  : "border-pickle/40 bg-pickle/5"
              }`}
            >
              <div className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
                {PLACE_LABELS[p.place]}
              </div>
              {winner && (
                <div className="mt-1 truncate font-display text-display-sm font-extrabold text-pickle">
                  {winner.display_name}
                </div>
              )}
              {p.description && (
                <div className="mt-1 text-sm text-white/90">
                  {p.description}
                </div>
              )}
              {p.sponsor_name && (
                <div className="mt-1 text-xs uppercase tracking-wide text-white/50">
                  sponsored by {p.sponsor_name}
                </div>
              )}
              {p.sponsor_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.sponsor_image_url}
                  alt={p.sponsor_name ?? `Prize ${p.place} sponsor`}
                  className={`mt-2 w-full rounded-lg border-2 border-white/10 bg-black object-contain ${
                    compact ? "h-16" : "h-32"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================================
// Standings table (shared)
// ===================================================================
function StandingsTable({
  standings,
  highlightTop3 = false,
}: {
  standings: Standing[];
  highlightTop3?: boolean;
}) {
  return (
    <div>
      <h2 className="font-display text-display-base font-bold text-white">
        Standings
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-pickle text-black">
            <tr>
              <th className="px-3 py-2 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
                #
              </th>
              <th className="px-3 py-2 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
                Player
              </th>
              <th className="px-3 py-2 text-right font-display text-display-xs uppercase font-extrabold tracking-wide">
                Pts
              </th>
              <th className="px-3 py-2 text-right font-display text-display-xs uppercase font-extrabold tracking-wide">
                W–L
              </th>
              <th className="px-3 py-2 text-right font-display text-display-xs uppercase font-extrabold tracking-wide">
                Games
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/50">
                  No standings yet.
                </td>
              </tr>
            )}
            {standings.map((s, i) => {
              const isTop3 = highlightTop3 && i < 3;
              return (
                <tr
                  key={s.player_id}
                  className={`border-t-2 border-pickle/30 ${
                    isTop3 ? "bg-bright/10" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-sm text-white/70">
                    {i + 1}
                    {i === 0 && highlightTop3 && " 🏆"}
                  </td>
                  <td className="px-3 py-2 text-white">{s.display_name}</td>
                  <td className="px-3 py-2 text-right font-display text-display-sm font-extrabold text-pickle">
                    {s.total_points}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-white/70">
                    {s.wins}–{s.losses}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-white/50">
                    {s.games_played}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
