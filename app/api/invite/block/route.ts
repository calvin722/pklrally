import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

interface InviteRequest {
  blockId: string;
  guestPlayerId: string;
}

/**
 * Send an email invitation for an open-play block.
 *
 * Auth: caller must be the inviter (i.e., the player who added the
 * guest to the block via open_play_attendees.invited_by).
 *
 * Triggered automatically by InviteToBlockSheet after a non-member is
 * added by email.
 */
export async function POST(request: Request) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: InviteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { blockId, guestPlayerId } = body;
  if (!blockId || !guestPlayerId) {
    return NextResponse.json(
      { error: "blockId and guestPlayerId required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
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

  // Pull block + court + guest details
  const { data: block, error: blockErr } = await supabase
    .from("open_play_blocks")
    .select(
      `id, court_id, starts_at, ends_at, notes,
       court:courts (id, name, address, city, state, timezone)`,
    )
    .eq("id", blockId)
    .maybeSingle();
  if (blockErr || !block) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const { data: guest } = await supabase
    .from("players")
    .select("id, display_name, email, invite_token, auth_user_id, is_guest")
    .eq("id", guestPlayerId)
    .maybeSingle();
  if (!guest || !guest.email) {
    return NextResponse.json(
      { error: "Recipient has no email" },
      { status: 400 },
    );
  }
  const recipientIsMember = !!guest.auth_user_id && !guest.is_guest;

  // Confirm caller invited the guest (or is admin) — defense in depth
  const { data: attendee } = await supabase
    .from("open_play_attendees")
    .select("invited_by")
    .eq("block_id", blockId)
    .eq("player_id", guestPlayerId)
    .maybeSingle();
  if (!attendee || attendee.invited_by !== callerPlayer.id) {
    // Not strictly required to fail (admin could send) but be conservative
    const { data: callerIsAdmin } = await supabase.rpc(
      "is_current_user_admin",
    );
    if (!callerIsAdmin) {
      return NextResponse.json(
        { error: "Not the inviter for this block" },
        { status: 403 },
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);
  const court = j(block.court);
  const tz = court?.timezone ?? "America/Denver";
  const startStr = new Date(block.starts_at).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });
  const endStr = new Date(block.ends_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  const courtLabel = court
    ? `${court.name} — ${court.city}, ${court.state}`
    : "your local court";
  const courtAddress = court?.address ? `<br>${escapeHtml(court.address)}` : "";

  // Deep link:
  //   - members: straight to the court's play schedule (they're signed in)
  //   - guests with token: claim URL
  //   - guests without token: generic /play
  const courtPathSlug = court
    ? `/play/${String(court.state).toLowerCase()}/${slugify(String(court.city))}/${court.id}`
    : "/play";
  const link = recipientIsMember
    ? `${SITE_URL}${courtPathSlug}`
    : guest.invite_token
      ? `${SITE_URL}/c/${guest.invite_token}`
      : `${SITE_URL}/play`;

  const subject = `${callerPlayer.display_name} invited you to open play on ${new Date(block.starts_at).toLocaleDateString("en-US", { weekday: "long", timeZone: tz })}`;

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#0a0a0a;border:2px solid #00BFFF;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">play, track &amp; win</p>

    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:22px;color:#00BFFF;margin:0 0 16px;">You're invited to open play</h2>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Hi ${escapeHtml(guest.display_name)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
      ${escapeHtml(callerPlayer.display_name)} added you to an open-play
      session on PKLRALLY. Tap below to confirm and you&rsquo;re in.
    </p>

    <div style="background:#0a2540;border:2px solid #00BFFF;border-radius:12px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#00BFFF;font-weight:700;">When + where</p>
      <p style="margin:0 0 4px;font-size:16px;"><strong>${escapeHtml(startStr)} – ${escapeHtml(endStr)}</strong></p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">${escapeHtml(courtLabel)}${courtAddress}</p>
    </div>

    ${block.notes ? `<p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:rgba(255,255,255,0.7);"><strong>Notes:</strong> ${escapeHtml(block.notes)}</p>` : ""}

    <p style="margin:24px 0;text-align:center;">
      <a href="${link}" style="display:inline-block;background:#00BFFF;color:#000;text-decoration:none;padding:14px 28px;border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;">${recipientIsMember ? "View the session →" : "Confirm I&rsquo;m in →"}</a>
    </p>

    ${
      recipientIsMember
        ? `<p style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.5;margin-top:24px;">
      You&rsquo;re already on the attendee list. Tap above to see who else
      is going, message in the notes, or leave the session if plans change.
    </p>`
        : `<p style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.5;margin-top:24px;">
      PKLRALLY is the social map of pickleball — find games, log matches,
      compete for monthly prizes. When you sign up using this email, this
      session and any matches played there count toward your stats.
    </p>`
    }

    <p style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.5;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">
      Not interested? Just ignore this email. Nothing happens to your data
      and you won&rsquo;t hear from us again.
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
      to: [guest.email],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("Block invite send failed:", res.status, errBody);
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

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
