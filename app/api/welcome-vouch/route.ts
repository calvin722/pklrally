import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

/**
 * Welcome-vouch email — sent right after a guest signs up + claims their
 * account. Lists every match they were logged into that's now waiting on
 * their vouch, and links them straight to /vouch.
 *
 * Triggered from /auth/callback on first claim. Idempotent: caller is
 * responsible for only firing once per claim (we use the recent
 * claimed_at timestamp as the gate).
 */
export async function POST() {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // We need the player's email + display_name + their pending matches.
  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("id, display_name, email, claimed_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!player || !player.email) {
    return NextResponse.json({ error: "No player email" }, { status: 404 });
  }

  // Pull every pending match where this player is on the team OPPOSITE the
  // logger. We're listing matches THEY can vouch (not ones they logged).
  const { data: matchesRaw } = await admin
    .from("matches")
    .select(
      `id, played_at, server_score, receiver_score, logged_by,
       server_team_p1, server_team_p2,
       receiver_team_p1, receiver_team_p2,
       court:courts (name, city, state),
       logger:players!matches_logged_by_fkey (display_name)`,
    )
    .eq("status", "pending")
    .order("played_at", { ascending: false })
    .limit(50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);

  type RawMatch = {
    id: string;
    played_at: string;
    server_score: number;
    receiver_score: number;
    logged_by: string;
    server_team_p1: string;
    server_team_p2: string;
    receiver_team_p1: string;
    receiver_team_p2: string;
    court: unknown;
    logger: unknown;
  };

  const myMatches = ((matchesRaw ?? []) as RawMatch[]).filter((m) => {
    const onServer =
      m.server_team_p1 === player.id || m.server_team_p2 === player.id;
    const onReceiver =
      m.receiver_team_p1 === player.id || m.receiver_team_p2 === player.id;
    const loggerOnServer =
      m.logged_by === m.server_team_p1 || m.logged_by === m.server_team_p2;
    const loggerOnReceiver =
      m.logged_by === m.receiver_team_p1 || m.logged_by === m.receiver_team_p2;
    // Player is on opposite team from logger
    return (
      (onReceiver && loggerOnServer) || (onServer && loggerOnReceiver)
    );
  });

  if (myMatches.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "no_pending" });
  }

  const matchRows = myMatches
    .map((m) => {
      const court = j(m.court);
      const logger = j(m.logger);
      const courtLabel = court
        ? `${court.name}, ${court.city}, ${court.state}`
        : "your local court";
      const date = new Date(m.played_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const high = Math.max(m.server_score, m.receiver_score);
      const low = Math.min(m.server_score, m.receiver_score);
      return `<tr>
        <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:14px;color:rgba(255,255,255,0.85);">${escapeHtml(date)}</td>
        <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:14px;color:rgba(255,255,255,0.85);">${escapeHtml(courtLabel)}</td>
        <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:14px;color:rgba(255,255,255,0.85);">vs ${escapeHtml(logger?.display_name ?? "?")}</td>
        <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:14px;color:#99FF00;font-family:'JetBrains Mono',monospace;font-weight:700;">${high}–${low}</td>
      </tr>`;
    })
    .join("");

  const vouchUrl = `${SITE_URL}/vouch`;
  const subject = `Welcome to PKLRALLY — ${myMatches.length} match${myMatches.length === 1 ? "" : "es"} waiting for your vouch`;

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#0a0a0a;border:2px solid #99FF00;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">welcome to the live pulse of pickleball</p>
    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:22px;color:#FFFF00;margin:0 0 12px;">You have ${myMatches.length} match${myMatches.length === 1 ? "" : "es"} to vouch</h2>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Hi ${escapeHtml(player.display_name)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
      Here ${myMatches.length === 1 ? "is the match" : "are the matches"} someone logged with you on PKLRALLY.
      Confirming the score takes one tap, locks in your stats, and helps the score-keepers
      keep the ladder clean.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0 24px 0;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#99FF00;">Date</th>
          <th style="text-align:left;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#99FF00;">Court</th>
          <th style="text-align:left;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#99FF00;">Logged by</th>
          <th style="text-align:left;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#99FF00;">Score</th>
        </tr>
      </thead>
      <tbody>${matchRows}</tbody>
    </table>

    <p style="margin:24px 0;text-align:center;">
      <a href="${vouchUrl}" style="display:inline-block;background:#99FF00;color:#000;text-decoration:none;padding:14px 28px;border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;">Vouch my matches →</a>
    </p>

    <p style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.5;margin-top:24px;">
      If a score doesn&apos;t look right, you can dispute it from the same page —
      the logger will see your edit and can resubmit.
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
      to: [player.email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("welcome-vouch email send failed:", res.status, errBody);
    return NextResponse.json(
      { error: `Email send failed (${res.status})` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sent: true, count: myMatches.length });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
