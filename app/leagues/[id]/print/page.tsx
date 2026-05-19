import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type LeagueMatch,
  type LeagueRound,
  type LeaguePlayer,
  formatLeagueDateTime,
  DEFAULT_LEAGUE_TZ,
} from "@/lib/leagues";
import PrintButtonClient from "./PrintButtonClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintLeaguePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound();

  // Court (for timezone + label)
  let courtLabel: string | null = null;
  let tz: string = DEFAULT_LEAGUE_TZ;
  if (league.court_id) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, city, state, timezone")
      .eq("id", league.court_id)
      .maybeSingle();
    if (court) {
      courtLabel = `${court.name} — ${court.city}, ${court.state}`;
      if (court.timezone) tz = court.timezone;
    }
  } else if (league.manual_court_name) {
    courtLabel = [league.manual_court_name, league.manual_court_address]
      .filter(Boolean)
      .join(" — ");
  }

  // Roster + bye groups
  const { data: lpRows } = await supabase
    .from("league_players")
    .select("league_id, player_id, bye_group, joined_at")
    .eq("league_id", id)
    .order("joined_at", { ascending: true });
  const playerIds = (lpRows ?? []).map((r) => r.player_id);
  const { data: playerRows } = playerIds.length
    ? await supabase
        .from("players")
        .select("id, display_name")
        .in("id", playerIds)
    : { data: [] as Array<{ id: string; display_name: string }> };
  const playerNameById = new Map(
    (playerRows ?? []).map((p) => [p.id, p.display_name] as const),
  );
  const playerName = (pid: string) => playerNameById.get(pid) ?? "Player";
  const players: LeaguePlayer[] = (lpRows ?? []).map((r) => ({
    league_id: r.league_id,
    player_id: r.player_id,
    bye_group: r.bye_group,
    joined_at: r.joined_at,
    display_name: playerName(r.player_id),
    username: null,
    avatar_url: null,
    avatar_focal_x: null,
    avatar_focal_y: null,
    is_guest: false,
  }));

  // Rounds + matches (may be partial if league not fully played)
  const { data: roundsRaw } = await supabase
    .from("league_rounds")
    .select("*")
    .eq("league_id", id)
    .order("session_number", { ascending: true })
    .order("round_number", { ascending: true });
  const { data: matchesRaw } = await supabase
    .from("league_matches")
    .select("*")
    .eq("league_id", id)
    .order("court_number", { ascending: true });
  const rounds = (roundsRaw ?? []) as LeagueRound[];
  const matches = (matchesRaw ?? []) as LeagueMatch[];

  // Prizes
  const { data: prizes } = await supabase
    .from("league_prizes")
    .select("place, description, sponsor_name")
    .eq("league_id", id)
    .order("place", { ascending: true });

  return (
    <div className="min-h-svh bg-white text-black">
      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 z-50 flex items-center justify-between gap-3 border-b-2 border-black bg-white px-4 py-3">
        <Link
          href={`/leagues/${id}`}
          className="text-sm font-semibold text-black hover:underline"
        >
          ◀ Back to league
        </Link>
        <div className="text-xs text-black/60">
          Use <strong>Cmd+P</strong> (or your browser&rsquo;s Print menu) to save as PDF
        </div>
        <PrintButtonClient />
      </div>

      <div className="mx-auto max-w-[8.5in] px-8 py-6 font-serif text-[12pt] leading-tight print:px-0 print:py-0">
        {/* ---- Header ---- */}
        <header className="border-b-2 border-black pb-3">
          <h1 className="text-[24pt] font-extrabold leading-none">{league.name}</h1>
          <div className="mt-1 text-sm">
            {league.scheduled_at && (
              <div>📅 {formatLeagueDateTime(league.scheduled_at, tz)}</div>
            )}
            {courtLabel && <div>📍 {courtLabel}</div>}
            <div className="mt-1 text-xs">
              {league.n_courts} courts · {league.n_rounds} rounds
              {league.n_sessions > 1 && ` × ${league.n_sessions} sessions`} · +
              {league.win_bonus} win bonus
              {league.court_rules && ` · ${league.court_rules}`}
            </div>
          </div>
          {league.description && (
            <p className="mt-2 whitespace-pre-line text-xs">
              {league.description}
            </p>
          )}
        </header>

        {/* ---- Roster ---- */}
        <section className="mt-4">
          <h2 className="text-[14pt] font-bold uppercase tracking-wide">
            Roster ({players.length} player{players.length === 1 ? "" : "s"})
          </h2>
          <ol className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {players.map((p, i) => (
              <li key={p.player_id} className="flex justify-between">
                <span>
                  <span className="inline-block w-6 text-right text-xs text-black/60">
                    {i + 1}.
                  </span>{" "}
                  {p.display_name}
                </span>
                {p.bye_group && (
                  <span className="text-xs text-black/60">
                    bye grp {p.bye_group}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Prizes (if any) ---- */}
        {prizes && prizes.length > 0 && (
          <section className="mt-4 border-t border-black/30 pt-3">
            <h2 className="text-[12pt] font-bold uppercase tracking-wide">
              Prizes
            </h2>
            <ul className="mt-1 text-sm">
              {prizes.map((p) => (
                <li key={p.place}>
                  {p.place === 1 ? "🥇" : p.place === 2 ? "🥈" : "🥉"}{" "}
                  <strong>{p.description ?? "Prize"}</strong>
                  {p.sponsor_name && (
                    <span className="text-black/60"> · sponsored by {p.sponsor_name}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Scorecards ---- */}
        {Array.from({ length: league.n_sessions }, (_, sIdx) => {
          const sessionNum = sIdx + 1;
          const sessionDate = league.session_dates?.[sIdx] ?? null;
          return (
            <section
              key={sessionNum}
              className="mt-6 break-before-page print:break-before-page"
            >
              {league.n_sessions > 1 && (
                <h2 className="border-b-2 border-black pb-1 text-[16pt] font-bold">
                  Session {sessionNum} of {league.n_sessions}
                  {sessionDate && (
                    <span className="ml-2 text-sm font-normal text-black/60">
                      {formatLeagueDateTime(sessionDate, tz)}
                    </span>
                  )}
                </h2>
              )}
              {Array.from({ length: league.n_rounds }, (_, rIdx) => {
                const roundNum = rIdx + 1;
                const round = rounds.find(
                  (r) =>
                    r.session_number === sessionNum &&
                    r.round_number === roundNum,
                );
                const roundMatches = round
                  ? matches
                      .filter((m) => m.round_id === round.id)
                      .sort((a, b) => a.court_number - b.court_number)
                  : [];
                const byes = round?.byes ?? [];
                return (
                  <RoundCard
                    key={`${sessionNum}-${roundNum}`}
                    sessionNum={sessionNum}
                    roundNum={roundNum}
                    nCourts={league.n_courts}
                    nSessions={league.n_sessions}
                    matches={roundMatches}
                    byes={byes}
                    playerName={playerName}
                    isLastInPair={rIdx % 2 === 1}
                  />
                );
              })}
            </section>
          );
        })}

        {/* ---- Final Standings ---- */}
        <section className="mt-6 break-before-page print:break-before-page">
          <h2 className="border-b-2 border-black pb-1 text-[16pt] font-bold">
            Final Standings
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black">
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">Player</th>
                <th className="px-2 py-1 text-right">Pts</th>
                <th className="px-2 py-1 text-right">W</th>
                <th className="px-2 py-1 text-right">L</th>
                <th className="px-2 py-1 text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(players.length, 20) }, (_, i) => (
                <tr key={i} className="border-b border-black/20">
                  <td className="px-2 py-2 text-xs">{i + 1}</td>
                  <td className="px-2 py-2">&nbsp;</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-8 border-t border-black/30 pt-2 text-center text-[9pt] text-black/40">
          PKLRALLY · pklrally.com
        </footer>
      </div>
    </div>
  );
}

// =====================================================================
// Round card
// =====================================================================
function RoundCard({
  sessionNum,
  roundNum,
  nCourts,
  nSessions,
  matches,
  byes,
  playerName,
  isLastInPair,
}: {
  sessionNum: number;
  roundNum: number;
  nCourts: number;
  nSessions: number;
  matches: LeagueMatch[];
  byes: string[];
  playerName: (id: string) => string;
  isLastInPair: boolean;
}) {
  return (
    <div
      className={`mt-4 rounded-lg border-2 border-black p-3 ${
        isLastInPair ? "break-after-page print:break-after-page" : ""
      }`}
    >
      <div className="flex items-baseline justify-between border-b border-black pb-1">
        <h3 className="text-[13pt] font-bold">
          {nSessions > 1 && `S${sessionNum} · `}Round {roundNum}
        </h3>
        <div className="text-xs text-black/60">
          Byes:{" "}
          {byes.length > 0
            ? byes.map(playerName).join(", ")
            : "_______________________________"}
        </div>
      </div>

      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="text-xs text-black/60">
            <th className="w-16 text-left font-normal">Court</th>
            <th className="text-left font-normal">Team A</th>
            <th className="w-12 text-center font-normal">A</th>
            <th className="w-8 text-center font-normal">vs</th>
            <th className="w-12 text-center font-normal">B</th>
            <th className="text-left font-normal">Team B</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: nCourts }, (_, ci) => {
            const courtNum = ci + 1;
            const m = matches.find((mm) => mm.court_number === courtNum);
            return (
              <tr key={courtNum} className="border-t border-black/30">
                <td className="py-2 font-bold">
                  Court {courtNum}
                  {courtNum === 1 && " 👑"}
                </td>
                <td className="py-2">
                  {m ? (
                    <span>
                      {playerName(m.team_a_p1)}
                      <br />
                      {playerName(m.team_a_p2)}
                    </span>
                  ) : (
                    <span className="text-black/30">
                      _________________
                      <br />
                      _________________
                    </span>
                  )}
                </td>
                <td className="py-2 text-center text-[14pt] font-bold">
                  {m?.team_a_score !== null && m?.team_a_score !== undefined
                    ? m.team_a_score
                    : "___"}
                </td>
                <td className="py-2 text-center text-xs text-black/40">vs</td>
                <td className="py-2 text-center text-[14pt] font-bold">
                  {m?.team_b_score !== null && m?.team_b_score !== undefined
                    ? m.team_b_score
                    : "___"}
                </td>
                <td className="py-2">
                  {m ? (
                    <span>
                      {playerName(m.team_b_p1)}
                      <br />
                      {playerName(m.team_b_p2)}
                    </span>
                  ) : (
                    <span className="text-black/30">
                      _________________
                      <br />
                      _________________
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

