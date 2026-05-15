import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

interface InviteRequest {
  leagueId: string;
  inviteId: string;
}

/**
 * Send an email invitation to join a league. Auth: caller must be the
 * league creator (or admin).
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
  const { leagueId, inviteId } = body;
  if (!leagueId || !inviteId) {
    return NextResponse.json(
      { error: "leagueId and inviteId required" },
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
  const { data: caller } = await supabase
    .from("players")
    .select("id, display_name, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!caller) {
    return NextResponse.json({ error: "No player row" }, { status: 403 });
  }

  // Load league + court (for nice address) + invite + prizes
  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, description, scheduled_at, created_by, court_id, manual_court_name, manual_court_address, court_rules",
    )
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }
  if (league.created_by !== caller.id && !caller.is_admin) {
    return NextResponse.json(
      { error: "Only the league creator can send invites" },
      { status: 403 },
    );
  }

  const { data: invite } = await supabase
    .from("league_invites")
    .select("id, email, invite_token")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  // Optional: court name + address
  let courtLabel = "";
  let courtAddress = "";
  if (league.court_id) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, address, city, state")
      .eq("id", league.court_id)
      .maybeSingle();
    if (court) {
      courtLabel = `${court.name} — ${court.city}, ${court.state}`;
      if (court.address) courtAddress = court.address;
    }
  } else if (league.manual_court_name || league.manual_court_address) {
    courtLabel = league.manual_court_name ?? "";
    courtAddress = league.manual_court_address ?? "";
  }

  // Prizes for the email
  const { data: prizes } = await supabase
    .from("league_prizes")
    .select("place, description, sponsor_name")
    .eq("league_id", leagueId)
    .order("place", { ascending: true });

  const dateLabel = league.scheduled_at
    ? new Date(league.scheduled_at).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "Date TBA";

  const acceptUrl = `${SITE_URL}/leagues/${leagueId}/rsvp/${invite.invite_token}?action=accept`;
  const declineUrl = `${SITE_URL}/leagues/${leagueId}/rsvp/${invite.invite_token}?action=decline`;
  const viewUrl = `${SITE_URL}/leagues/${leagueId}/rsvp/${invite.invite_token}`;

  const prizeRows = (prizes ?? [])
    .map((p) => {
      const medal = p.place === 1 ? "🥇" : p.place === 2 ? "🥈" : "🥉";
      const sponsor = p.sponsor_name ? ` <span style="color:rgba(255,255,255,0.5);">(${escapeHtml(p.sponsor_name)})</span>` : "";
      return `<tr><td style="padding:4px 0;font-size:14px;">${medal} ${escapeHtml(p.description ?? "Prize")}${sponsor}</td></tr>`;
    })
    .join("");

  const subject = `${caller.display_name} invited you to ${league.name}`;

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#0a0a0a;border:2px solid #99FF00;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">play, track &amp; win</p>

    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:24px;color:#FFFF00;margin:0 0 16px;">You're invited to a ladder league</h2>

    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
      <strong>${escapeHtml(caller.display_name)}</strong> invited you to play in
      <strong>${escapeHtml(league.name)}</strong>.
    </p>

    ${
      league.description
        ? `<p style="font-size:15px;line-height:1.5;margin:0 0 16px;color:rgba(255,255,255,0.85);">${escapeHtml(league.description)}</p>`
        : ""
    }

    <div style="background:#0a1a00;border:2px solid #99FF00;border-radius:12px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#99FF00;font-weight:700;">When + where</p>
      <p style="margin:0 0 4px;font-size:16px;"><strong>${escapeHtml(dateLabel)}</strong></p>
      ${courtLabel ? `<p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">${escapeHtml(courtLabel)}</p>` : ""}
      ${courtAddress ? `<p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">${escapeHtml(courtAddress)}</p>` : ""}
      ${league.court_rules ? `<p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.6);"><strong>Format:</strong> ${escapeHtml(league.court_rules)}</p>` : ""}
    </div>

    ${
      prizeRows
        ? `<div style="background:rgba(255,255,0,0.05);border:2px solid rgba(255,255,0,0.3);border-radius:12px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#FFFF00;font-weight:700;">Prizes</p>
            <table style="width:100%;border-collapse:collapse;">${prizeRows}</table>
          </div>`
        : ""
    }

    <p style="margin:24px 0;text-align:center;">
      <a href="${acceptUrl}" style="display:inline-block;background:#99FF00;color:#000;text-decoration:none;padding:14px 28px;border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;margin:0 4px 8px;">✓ I'm in</a>
      <a href="${declineUrl}" style="display:inline-block;background:transparent;color:#fff;text-decoration:none;padding:14px 28px;border:2px solid rgba(255,255,255,0.4);border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;margin:0 4px 8px;">Can't make it</a>
    </p>

    <p style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.5;text-align:center;margin-top:8px;">
      Or view the full league page first:<br>
      <a href="${viewUrl}" style="color:#99FF00;">${escapeHtml(viewUrl)}</a>
    </p>

    <p style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.5;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">
      PKLRALLY is the social map of pickleball. Find games, log matches, climb local ladders.
      Not interested? Just ignore this email — no account is created until you tap "I'm in".
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
      to: [invite.email],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("League invite send failed:", res.status, errBody);
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
