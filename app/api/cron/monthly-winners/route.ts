import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

/**
 * Monthly winners email cron.
 *
 * Schedule: 1st of each month at 9 AM Mountain (16:00 UTC year-round —
 * close enough; will be 9 AM MST in winter, 10 AM MDT in summer).
 *
 * Auth: caller must include `x-cron-secret: $CRON_SECRET` header. Set
 * CRON_SECRET in Netlify env. The scheduler (external cron service or
 * Netlify scheduled function) sends that header.
 *
 * Behavior:
 *   1. Pulls all distinct (city, state) pairs that have had at least one
 *      vouched match in the previous month.
 *   2. For each city, calls city_monthly_ladder() for last month.
 *   3. For each player on the ladder with an email, sends a recap of
 *      the top 3 + their own rank + final stats.
 *
 * Idempotent within a month: if you trigger twice, players get two
 * emails. Run once per month.
 */
export async function POST(request: Request) {
  // Auth gate
  const headerSecret = request.headers.get("x-cron-secret");
  if (!CRON_SECRET || headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  // Compute "previous month" key (YYYY-MM) in UTC
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthLabel = prev.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const admin = createAdminClient();

  // Find every (city, state) with vouched matches in the previous month
  const start = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), 1));
  const end = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1));

  const { data: matchesRaw, error: matchesErr } = await admin
    .from("matches")
    .select("court:courts (city, state)")
    .eq("status", "vouched")
    .gte("played_at", start.toISOString())
    .lt("played_at", end.toISOString());

  if (matchesErr) {
    return NextResponse.json({ error: matchesErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (v: any) => (Array.isArray(v) ? v[0] : v);
  const cityKeys = new Set<string>();
  for (const row of (matchesRaw ?? []) as Array<{ court: unknown }>) {
    const court = j(row.court);
    if (court?.city && court?.state) {
      cityKeys.add(
        `${court.city}|${String(court.state).toUpperCase()}`,
      );
    }
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const key of cityKeys) {
    const [city, state] = key.split("|");

    // Pull the ladder for this city + previous month
    const { data: ladderRows, error: ladderErr } = await admin.rpc(
      "city_monthly_ladder",
      { p_city: city, p_state: state, p_month_key: monthKey },
    );
    if (ladderErr) {
      errors.push(`${city}, ${state}: ${ladderErr.message}`);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ladder = (ladderRows ?? []) as any[];
    if (ladder.length === 0) continue;

    // Pull emails for ladder players (need a separate query — RPC doesn't
    // include emails since it's exposed publicly).
    const playerIds = ladder.map((r) => r.player_id);
    const { data: players } = await admin
      .from("players")
      .select("id, display_name, email")
      .in("id", playerIds);

    const emailById = new Map<string, { name: string; email: string }>();
    for (const p of players ?? []) {
      if (p.email) {
        emailById.set(p.id, { name: p.display_name, email: p.email });
      }
    }

    const top3 = ladder.slice(0, 3);
    const winnersBlock = top3
      .map((row, i) => {
        const place = ["1st", "2nd", "3rd"][i] ?? `${i + 1}th`;
        const winRate = Math.round(row.win_rate * 100);
        return `<tr>
          <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:14px;color:#FFFF00;font-weight:700;">${place}</td>
          <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:14px;color:#FFFFFF;">${escapeHtml(row.display_name)}</td>
          <td style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.1);font-size:13px;color:rgba(255,255,255,0.7);font-family:'JetBrains Mono',monospace;">${row.wins}W · ${winRate}% · ${Number(row.score).toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    // Send to each player on the ladder
    for (const row of ladder) {
      const recipient = emailById.get(row.player_id);
      if (!recipient) {
        skipped++;
        continue;
      }
      const yourRank = row.rank;
      const yourWinRate = Math.round(row.win_rate * 100);

      const html = renderEmail({
        recipientName: recipient.name,
        cityName: city,
        stateUpper: state.toUpperCase(),
        monthLabel,
        winnersBlock,
        yourRank,
        yourWins: row.wins,
        yourLosses: row.losses,
        yourWinRate,
        yourScore: Number(row.score).toFixed(2),
        ladderUrl: `${SITE_URL}/ladder/${state.toLowerCase()}/${slugify(city)}`,
      });

      const subject = `${city} ${monthLabel} ladder — final results · you finished #${yourRank}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "PKLRALLY <noreply@mail.pklrally.com>",
          to: [recipient.email],
          subject,
          html,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        const errBody = await res.text();
        errors.push(
          `${recipient.email} (${city}): ${res.status} ${errBody.slice(0, 100)}`,
        );
      }
    }
  }

  return NextResponse.json({
    monthKey,
    cities: cityKeys.size,
    sent,
    skipped,
    errors: errors.slice(0, 20),
  });
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmail(p: {
  recipientName: string;
  cityName: string;
  stateUpper: string;
  monthLabel: string;
  winnersBlock: string;
  yourRank: number;
  yourWins: number;
  yourLosses: number;
  yourWinRate: number;
  yourScore: string;
  ladderUrl: string;
}): string {
  return `
<div style="font-family:Inter,system-ui,sans-serif;background:#000;color:#fff;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#0a0a0a;border:2px solid #99FF00;border-radius:16px;padding:32px;">
    <h1 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:32px;letter-spacing:-0.02em;color:#99FF00;margin:0 0 4px;">PKL<span style="color:#FFFF00;">RALLY</span></h1>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:14px;">play, track &amp; win</p>

    <h2 style="font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:22px;color:#FFFF00;margin:0 0 12px;">
      ${escapeHtml(p.cityName)}, ${escapeHtml(p.stateUpper)} · ${escapeHtml(p.monthLabel)} Ladder
    </h2>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Hi ${escapeHtml(p.recipientName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
      The ${escapeHtml(p.monthLabel)} ladder is locked in. Here are the final standings.
    </p>

    <p style="margin:24px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#99FF00;font-weight:700;">Top 3</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
      <tbody>${p.winnersBlock}</tbody>
    </table>

    <div style="background:#0a2540;border:2px solid #99FF00;border-radius:12px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#99FF00;font-weight:700;">Your final stats</p>
      <p style="margin:0;font-size:20px;font-family:Manrope,system-ui,sans-serif;font-weight:800;color:#FFFFFF;">
        Rank <span style="color:#FFFF00;">#${p.yourRank}</span>
        · ${p.yourWins}W ${p.yourLosses}L · ${p.yourWinRate}% · score ${p.yourScore}
      </p>
    </div>

    <p style="font-size:14px;line-height:1.5;margin:0 0 24px;color:rgba(255,255,255,0.7);">
      A new month resets everyone to zero. Log a rally in ${escapeHtml(p.cityName)}
      and start climbing again.
    </p>

    <p style="margin:24px 0;text-align:center;">
      <a href="${p.ladderUrl}" style="display:inline-block;background:#99FF00;color:#000;text-decoration:none;padding:14px 28px;border-radius:12px;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:0.04em;">View this month&apos;s ladder →</a>
    </p>
  </div>
</div>`;
}
