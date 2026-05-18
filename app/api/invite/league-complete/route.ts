import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatLeagueDateTime, DEFAULT_LEAGUE_TZ } from "@/lib/leagues";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

interface RouteRequest {
  leagueId: string;
}

interface PlayerRow {
  id: string;
  display_name: string;
  email: string | null;
}

interface MatchRow {
  league_id: string;
  team_a_p1: string;
  team_a_p2: string;
  team_b_p1: string;
  team_b_p2: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner: "a" | "b" | null;
}

interface Standing {
  playerId: string;
  displayName: string;
  email: string | null;
  totalPoints: number;
  wins: number;
  losses: number;
  games: number;
}

/**
 * Send a "league is done" email to every registered player with an email.
 * Each email is personalized with the player's final rank, points, and
 * (for the top 3) the prize they won. Auth: caller must be the league
 * creator (or an admin).
 *
 * Called automatically when the league transitions to status='finished'
 * (from advanceRound or finalizeLeague). Can also be hit manually via the
 * "Resend results email" admin button on the finished dashboard.
 */
export async function POST(request: Request) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: RouteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { leagueId } = body;
  if (!leagueId) {
    return NextResponse.json({ error: "leagueId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from("players")
    .select("id, display_name, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!caller) {
    return NextResponse.json({ error: "No player row" }, { status: 403 });
  }

  // Load league
  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, status, created_by, win_bonus, scheduled_at, court_id, manual_court_name, n_sessions",
    )
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }
  if (league.created_by !== caller.id && !caller.is_admin) {
    return NextResponse.json(
      { error: "Only the league creator can send results" },
      { status: 403 },
    );
  }
  if (league.status !== "finished") {
    return NextResponse.json(
      { error: "League not finished yet" },
      { status: 400 },
    );
  }

  // Court timezone (for date formatting in the email)
  let tz = DEFAULT_LEAGUE_TZ;
  if (league.court_id) {
    const { data: court } = await supabase
      .from("courts")
      .select("timezone")
      .eq("id", league.court_id)
      .maybeSingle();
    if (court?.timezone) tz = court.timezone;
  }

  // Players in this league + their email (if any)
  const { data: lpRows } = await supabase
    .from("league_players")
    .select("player_id")
    .eq("league_id", leagueId);
  const playerIds = (lpRows ?? []).map((r) => r.player_id);
  if (playerIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }
  const { data: playerRows } = await supabase
    .from("players")
    .select("id, display_name, email")
    .in("id", playerIds);
  const playersById = new Map(
    ((playerRows ?? []) as PlayerRow[]).map((p) => [p.id, p] as const),
  );

  // All matches → compute final standings
  const { data: matchesRaw } = await supabase
    .from("league_matches")
    .select(
      "league_id, team_a_p1, team_a_p2, team_b_p1, team_b_p2, team_a_score, team_b_score, winner",
    )
    .eq("league_id", leagueId);
  const matches = (matchesRaw ?? []) as MatchRow[];

  const tally = new Map<string, Standing>();
  for (const pid of playerIds) {
    const p = playersById.get(pid);
    tally.set(pid, {
      playerId: pid,
      displayName: p?.display_name ?? "Player",
      email: p?.email ?? null,
      totalPoints: 0,
      wins: 0,
      losses: 0,
      games: 0,
    });
  }
  for (const m of matches) {
    if (m.team_a_score === null || m.team_b_score === null) continue;
    const aWon = m.winner === "a";
    const winners = aWon
      ? [m.team_a_p1, m.team_a_p2]
      : [m.team_b_p1, m.team_b_p2];
    const losers = aWon
      ? [m.team_b_p1, m.team_b_p2]
      : [m.team_a_p1, m.team_a_p2];
    const winScore = aWon ? m.team_a_score : m.team_b_score;
    const loseScore = aWon ? m.team_b_score : m.team_a_score;
    for (const pid of winners) {
      const s = tally.get(pid);
      if (!s) continue;
      s.totalPoints += winScore + league.win_bonus;
      s.wins += 1;
      s.games += 1;
    }
    for (const pid of losers) {
      const s = tally.get(pid);
      if (!s) continue;
      s.totalPoints += loseScore;
      s.losses += 1;
      s.games += 1;
    }
  }

  const sorted = Array.from(tally.values()).sort(
    (a, b) => b.totalPoints - a.totalPoints || b.wins - a.wins,
  );

  // Prizes — only matters for top 3
  const { data: prizesRaw } = await supabase
    .from("league_prizes")
    .select("place, description, sponsor_name")
    .eq("league_id", leagueId)
    .order("place", { ascending: true });
  const prizeByPlace = new Map<
    number,
    { description: string | null; sponsor: string | null }
  >();
  for (const p of prizesRaw ?? []) {
    prizeByPlace.set(p.place, {
      description: p.description ?? null,
      sponsor: p.sponsor_name ?? null,
    });
  }

  const dateLabel = formatLeagueDateTime(league.scheduled_at, tz);

  // Recipients = anyone with a real-looking email
  const recipients = sorted.filter(
    (s) =>
      s.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email) && !s.email.includes("__seed__"),
  );

  const total = sorted.length;
  const sends = await Promise.allSettled(
    recipients.map((s, idx) => {
      const rank = sorted.findIndex((x) => x.playerId === s.playerId) + 1;
      return sendOne({
        to: s.email as string,
        league,
        dateLabel,
        rank,
        total,
        stat: s,
        topThree: sorted.slice(0, 3),
        prize: rank <= 3 ? prizeByPlace.get(rank) ?? null : null,
        idx,
      });
    }),
  );

  const sent = sends.filter((r) => r.status === "fulfilled").length;
  const failed = sends.length - sent;

  return NextResponse.json({ ok: true, sent, failed, total: recipients.length });
}

async function sendOne(input: {
  to: string;
  league: {
    id: string;
    name: string;
    n_sessions: number;
  };
  dateLabel: string;
  rank: number;
  total: number;
  stat: Standing;
  topThree: Standing[];
  prize: { description: string | null; sponsor: string | null } | null;
  idx: number;
}) {
  const { to, league, dateLabel, rank, total, stat, topThree, prize } = input;
  const isPodium = rank <= 3;
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";

  let subject: string;
  if (rank === 1) subject = `🏆 You won ${league.name}!`;
  else if (rank === 2) subject = `🥈 You took 2nd in ${league.name}`;
  else if (rank === 3) subject = `🥉 You took 3rd in ${league.name}`;
  else subject = `${league.name} wrapped — you finished #${rank}`;

  const podiumRows = topThree
    .map((p, i) => {
      const m = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
      const isYou = p.playerId === stat.playerId;
      return `<tr>
        <td style="padding:6px 8px;font-size:14px;${isYou ? "color:#FFFF00;font-weight:700;" : "color:rgba(255,255,255,0.85);"}">${m} ${escapeHtml(p.displayName)}${isYou ? " (you)" : ""}</td>
        <td style="padding:6px 8px;font-size:14px;text-align:right;font-family:monospace;${isYou ? "color:#FFFF00;font-weight:700;" : "color:#99FF00;"}">${p.totalPoints} pts</td>
      </tr>`;
    })
    .join("");

  const prizeBlock = isPodium && prize?.description
    ? `<div style="background:rgba(255,255,0,0.08);border:2px solid #FFFF00;border-radius:12px;padding:16px 20px;margin:20px 0;">
         <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#FFFF00;font-weight:700;">${medal} Your prize</p>
         <p style="margin:0;font-size:16px;color:#fff;">${escapeHtml(prize.description)}</p>
         ${prize.sponsor ? `<p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.6);">Sponsored by ${escapeHtml(prize.sponsor)}</p>` : ""}
       </div>`
    : "";

  const heading = (() => {
    if (rank === 1) return `🏆 You won, ${escapeHtml(stat.displayName)}!`;
    if (rank === 2) return `🥈 2nd place, ${escapeHtml(stat.displayName)} — huge effort!`;
    if (rank === 3) return `🥉 3rd place, ${escapeHtml(stat.displayName)} — nicely done!`;
    return `Thanks for playing, ${escapeHtml(stat.displayName)}!`;
  })();

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#0a0a0a;border:2px solid #99FF00;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">play, track &amp; win</p>

    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:26px;color:${isPodium ? "#FFFF00" : "#99FF00"};margin:0 0 4px;">${heading}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.7);">${escapeHtml(league.name)} · finished ${escapeHtml(dateLabel)}</p>

    <div style="background:#0a1a00;border:2px solid #99FF00;border-radius:12px;padding:18px 22px;margin:20px 0;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#99FF00;font-weight:700;">Your final result</p>
      <p style="margin:0;font-size:32px;font-weight:800;color:#fff;">
        ${medal} #${rank} <span style="font-size:16px;color:rgba(255,255,255,0.6);font-weight:400;">of ${total}</span>
      </p>
      <table style="margin-top:14px;width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.6);">Total points</td>
          <td style="padding:4px 0;font-size:18px;font-weight:700;color:#99FF00;text-align:right;font-family:monospace;">${stat.totalPoints}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.6);">Record</td>
          <td style="padding:4px 0;font-size:14px;color:#fff;text-align:right;font-family:monospace;">${stat.wins}–${stat.losses} (${stat.games} games)</td>
        </tr>
      </table>
    </div>

    ${prizeBlock}

    <div style="margin:20px 0;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#99FF00;font-weight:700;">Top 3</p>
      <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.04);border-radius:8px;">${podiumRows}</table>
    </div>

    <p style="margin:24px 0;text-align:center;">
      <a href="${SITE_URL}/leagues/${league.id}" style="display:inline-block;background:#99FF00;color:#000;text-decoration:none;padding:12px 22px;border-radius:10px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:0.04em;margin:0 4px 8px;">View full results →</a>
      <a href="${SITE_URL}/stats" style="display:inline-block;background:transparent;color:#fff;text-decoration:none;padding:12px 22px;border:2px solid rgba(255,255,255,0.4);border-radius:10px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:0.04em;margin:0 4px 8px;">My stats →</a>
    </p>

    <p style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;text-align:center;margin-top:8px;">
      Stats from every league you play in are saved to your PKLRALLY profile.
      Climb across leagues, compete locally, win prizes.
    </p>

    <p style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.5;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">
      PKLRALLY — find and play pickleball games near you.
    </p>
  </div>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PKLRALLY <noreply@mail.pklrally.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(
      `League completion email failed (rank ${input.rank}):`,
      res.status,
      errBody,
    );
    throw new Error(`send failed ${res.status}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
