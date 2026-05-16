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
  addLeaguePlayer,
  removeLeaguePlayer,
  generateRound1,
  advanceRound,
  finalizeLeague,
  deleteLeague,
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
            standings={standings}
            rounds={rounds}
            matches={matches}
            players={players}
            prizes={prizes}
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
  players: LeagueState["players"];
  minPlayers: number;
  ready: boolean;
  isAdmin: boolean;
  busy: boolean;
  onAdded: () => Promise<void>;
  onStart: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-8">
      {isAdmin && (
        <AddPlayerForm leagueId={leagueId} onAdded={onAdded} />
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
            onClick={onStart}
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
  onAdded,
}: {
  leagueId: string;
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<Array<{ id: string; display_name: string }>>([]);
  const [adding, setAdding] = useState(false);
  const [lastClaimUrl, setLastClaimUrl] = useState<string | null>(null);
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
    try {
      await addLeaguePlayer({ leagueId, playerId });
      setQuery("");
      setResults([]);
      setLastClaimUrl(null);
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
    try {
      const res = await addLeaguePlayer({
        leagueId,
        displayName: name,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setQuery("");
      setEmail("");
      setPhone("");
      setResults([]);
      setLastClaimUrl(res.claimUrl);
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
        Type a name. If they&rsquo;re already a member, pick them. Otherwise add
        them as a guest (with an optional phone or email so they can claim
        their stats later).
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
                className="block w-full px-4 py-2 text-left text-sm text-white hover:bg-pickle/10"
              >
                {r.display_name}{" "}
                <span className="text-xs text-white/40">— add to league</span>
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

      {lastClaimUrl && (
        <div className="mt-3 rounded-lg border-2 border-bright bg-bright/10 px-3 py-2 text-xs text-white">
          <div className="font-bold text-bright">✓ Added · claim link:</div>
          <a
            href={lastClaimUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-pickle underline"
          >
            {lastClaimUrl}
          </a>
          <div className="mt-1 text-white/60">
            Text this to them so they can claim their stats after the league.
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
  standings,
  prizes,
}: {
  standings: Standing[];
  rounds: LeagueRound[];
  matches: LeagueMatch[];
  players: LeagueState["players"];
  prizes: LeaguePrize[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-bright bg-bright/5 px-6 py-5">
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
              <span className="font-bold">{standings[0].total_points} points</span>.
            </>
          ) : (
            <>No standings available.</>
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

  useEffect(() => {
    if (!league.court_id) {
      setCourtLabel(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("courts")
      .select("name, address, city, state")
      .eq("id", league.court_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const parts = [data.name, data.city && `${data.city}, ${data.state}`]
          .filter(Boolean)
          .join(" · ");
        setCourtLabel(parts);
      });
  }, [league.court_id]);

  const dateLabel = league.scheduled_at
    ? new Date(league.scheduled_at).toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
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
