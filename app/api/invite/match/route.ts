import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

interface InviteRequest {
  matchId: string;
  guestPlayerId: string;
}

/**
 * Sends an invite email to a guest who was logged into a match.
 * The email contains the match score, who they played with, and a sign-up
 * link. When the recipient signs up using the same email, the existing
 * `handle_new_auth_user` trigger auto-claims their guest player row, so
 * the match is attributed to them and stats accrue.
 *
 * Auth: caller must be the match's `logged_by` player.
 */
export async function POST(request: Request) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: InviteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { matchId, guestPlayerId } = body;
  if (!matchId || !guestPlayerId) {
    return NextResponse.json(
      { error: "matchId and guestPlayerId required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Authenticated caller must be the logger of the match
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerPlayer } = await supabase
    .from("players")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!callerPlayer) {
    return NextResponse.json({ error: "No player row" }, { status: 403 });
  }

  // Load match with court + all 4 player rows joined
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select(
      `id, server_score, receiver_score, played_at, logged_by,
       court:courts (name, city, state),
       server_team_p1:players!matches_server_team_p1_fkey(id, display_name, email, is_guest),
       server_team_p2:players!matches_server_team_p2_fkey(id, display_name, email, is_guest),
       receiver_team_p1:players!matches_receiver_team_p1_fkey(id, display_name, email, is_guest),
       receiver_team_p2:players!matches_receiver_team_p2_fkey(id, display_name, email, is_guest)`,
    )
    .eq("id", matchId)
    .maybeSingle();

  if (matchErr || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.logged_by !== callerPlayer.id) {
    return NextResponse.json(
      { error: "Only the match logger can send invites" },
      { status: 403 },
    );
  }

  // Find the guest player among the four slots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);
  const slots = [
    j(match.server_team_p1),
    j(match.server_team_p2),
    j(match.receiver_team_p1),
    j(match.receiver_team_p2),
  ];
  const guest = slots.find((p) => p?.id === guestPlayerId);
  if (!guest || !guest.is_guest || !guest.email) {
    return NextResponse.json(
      { error: "Guest not found in match or has no email" },
      { status: 404 },
    );
  }

  const court = j(match.court);
  const courtLabel = court
    ? `${court.name}, ${court.city}, ${court.state}`
    : "your local court";
  const score =
    match.server_score > match.receiver_score
      ? `${match.server_score} – ${match.receiver_score}`
      : `${match.receiver_score} – ${match.server_score}`;
  const playerNames = slots
    .filter(Boolean)
    .map((p) => p.display_name)
    .join(", ");
  const playedAtDate = new Date(match.played_at).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const signupUrl = `${SITE_URL}/login?email=${encodeURIComponent(guest.email)}&claim=${matchId}`;
  const subject = `${callerPlayer.display_name} just played a match with you on PKLRALLY`;

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#0a0a0a;border:2px solid #99FF00;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">the live pulse of pickleball</p>
    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:22px;color:#FFFF00;margin:0 0 16px;">You just got logged in a match</h2>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Hi ${escapeHtml(guest.display_name)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">${escapeHtml(callerPlayer.display_name)} logged a pickleball match with you on PKLRALLY.</p>
    <div style="background:#0a2540;border:2px solid #99FF00;border-radius:12px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#99FF00;font-weight:700;">Match details</p>
      <p style="margin:0 0 4px;font-size:16px;"><strong>Where:</strong> ${escapeHtml(courtLabel)}</p>
      <p style="margin:0 0 4px;font-size:16px;"><strong>When:</strong> ${escapeHtml(playedAtDate)}</p>
      <p style="margin:0 0 4px;font-size:16px;"><strong>Final score:</strong> <span style="font-family:'JetBrains Mono',monospace;color:#99FF00;font-weight:700;">${escapeHtml(score)}</span></p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);">Players: ${escapeHtml(playerNames)}</p>
    </div>
    <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">Want to claim this match and start tracking your stats?</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 24px;color:rgba(255,255,255,0.7);">PKLRALLY is a social map for pickleball — log matches, track wins, watch your home court light up live, and compete in monthly trophy ladders. When you sign up with the same email, this match automatically counts toward your record.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${signupUrl}" style="display:inline-block;background:#99FF00;color:#000;text-decoration:none;padding:14px 28px;border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;">Claim my stats →</a>
    </p>
    <p style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.5;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">If you didn't play in this match, just ignore this email — nothing happens to your data and you won't get more from us.</p>
  </div>
</div>`;

  // Send via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PKLRALLY <noreply@mail.pklrally.com>",
      to: [guest.email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Resend send failed:", res.status, errBody);
    return NextResponse.json(
      { error: `Email send failed (${res.status})` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
