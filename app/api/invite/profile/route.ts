import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

interface Body {
  playerId: string;
}

/**
 * Email a guest player an invitation to claim their PKLRALLY profile,
 * set their DUPR rating, and complete onboarding. Admin-only.
 *
 * Flow:
 *   1. Verify caller is an admin
 *   2. Fetch the target guest player (must have email, not yet claimed)
 *   3. Mint an invite_token if one isn't already set (90-day expiry)
 *   4. Send a friendly email via Resend that links to /c/<token>
 *      with ?next=/welcome so they land on the onboarding flow after
 *      signing in
 */
export async function POST(request: Request) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
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
  if (!caller?.is_admin) {
    return NextResponse.json(
      { error: "Admin only" },
      { status: 403 },
    );
  }

  const { data: player } = await supabase
    .from("players")
    .select(
      "id, display_name, email, is_guest, claimed_at, invite_token, invite_token_expires_at",
    )
    .eq("id", body.playerId)
    .maybeSingle();
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (!player.is_guest) {
    return NextResponse.json(
      { error: "Player is already a member" },
      { status: 400 },
    );
  }
  if (player.claimed_at) {
    return NextResponse.json(
      { error: "Player has already claimed their account" },
      { status: 400 },
    );
  }
  if (!player.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(player.email)) {
    return NextResponse.json(
      { error: "Player has no valid email on file" },
      { status: 400 },
    );
  }

  // Mint a token if missing or expired
  const now = Date.now();
  const expiry = player.invite_token_expires_at
    ? new Date(player.invite_token_expires_at).getTime()
    : 0;
  let token = player.invite_token;
  if (!token || expiry < now) {
    token = crypto.randomUUID();
    const newExpiry = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error: upErr } = await supabase
      .from("players")
      .update({
        invite_token: token,
        invite_token_expires_at: newExpiry,
      })
      .eq("id", body.playerId);
    if (upErr) {
      console.error("mint invite_token failed:", upErr);
      return NextResponse.json(
        { error: "Could not mint invite token (RLS may block)" },
        { status: 500 },
      );
    }
  }

  const claimUrl = `${SITE_URL}/c/${token}?next=${encodeURIComponent("/welcome")}`;
  const subject = `Claim your PKLRALLY profile, ${player.display_name}`;

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#0a0a0a;border:2px solid #99FF00;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">play, track &amp; win</p>

    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:24px;color:#FFFF00;margin:0 0 12px;">Claim your profile</h2>

    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
      Hi ${escapeHtml(player.display_name)} 👋
    </p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
      You&rsquo;ve been added to PKLRALLY as a guest player. Tap below to
      claim your profile so your league stats stay tied to <em>you</em>,
      set your <strong>DUPR rating</strong>, and unlock everything PKLRALLY
      does:
    </p>

    <ul style="font-size:15px;line-height:1.6;margin:0 0 20px;padding-left:20px;color:rgba(255,255,255,0.85);">
      <li>See your placements + stats across every league you play in</li>
      <li>Get notified when someone invites you to open play or a new league</li>
      <li>Climb local ladders and win prizes from neighborhood sponsors</li>
    </ul>

    <p style="margin:24px 0;text-align:center;">
      <a href="${claimUrl}" style="display:inline-block;background:#99FF00;color:#000;text-decoration:none;padding:14px 28px;border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;">Claim my profile →</a>
    </p>

    <p style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.5;text-align:center;">
      The link is good for 90 days. After signing in, you&rsquo;ll be guided
      through a short onboarding to add your DUPR rating and a photo.
    </p>

    <p style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.5;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">
      PKLRALLY — find and play pickleball games near you. If this wasn&rsquo;t
      you, just ignore the email; no account is created until you tap above.
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
    console.error("Profile invite send failed:", res.status, errBody);
    return NextResponse.json(
      { error: `Email send failed (${res.status})` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: player.email });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
