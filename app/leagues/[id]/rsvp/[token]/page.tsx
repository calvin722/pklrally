import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RsvpClient from "@/components/leagues/RsvpClient";
import { formatLeagueDateTime, DEFAULT_LEAGUE_TZ } from "@/lib/leagues";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; token: string }>;
  searchParams: Promise<{ action?: string }>;
}

export default async function RsvpPage({ params, searchParams }: PageProps) {
  const { id, token } = await params;
  const { action } = await searchParams;

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, description, scheduled_at, court_id, manual_court_name, manual_court_address, court_rules, session_dates, n_sessions",
    )
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound();

  // Look up court details (public)
  let courtLabel: string | null = null;
  let courtAddress: string | null = null;
  let courtTimezone: string = DEFAULT_LEAGUE_TZ;
  if (league.court_id) {
    const { data: court } = await supabase
      .from("courts")
      .select("name, address, city, state, timezone")
      .eq("id", league.court_id)
      .maybeSingle();
    if (court) {
      courtLabel = `${court.name} — ${court.city}, ${court.state}`;
      courtAddress = court.address ?? null;
      if (court.timezone) courtTimezone = court.timezone;
    }
  } else if (league.manual_court_name || league.manual_court_address) {
    courtLabel = league.manual_court_name;
    courtAddress = league.manual_court_address;
  }

  // Prizes (publicly readable)
  const { data: prizesRaw } = await supabase
    .from("league_prizes")
    .select("place, description, sponsor_name, sponsor_image_path")
    .eq("league_id", id)
    .order("place", { ascending: true });

  const prizes = (prizesRaw ?? []).map((p) => {
    let publicUrl: string | null = null;
    if (p.sponsor_image_path) {
      const { data } = supabase.storage
        .from("league-prizes")
        .getPublicUrl(p.sponsor_image_path);
      publicUrl = data.publicUrl;
    }
    return { ...p, sponsor_image_url: publicUrl };
  });

  const dateLabel = formatLeagueDateTime(league.scheduled_at, courtTimezone);

  // For multi-session leagues, render all dates in the court's local TZ.
  const allSessionLabels: string[] =
    league.n_sessions > 1 && Array.isArray(league.session_dates)
      ? league.session_dates.map((d: string) =>
          formatLeagueDateTime(d, courtTimezone),
        )
      : [];

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border-2 border-pickle bg-pickle/5 p-6">
          <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
            🏆 Ladder League Invite
          </div>
          <h1 className="mt-1 font-display text-display-2xl font-extrabold text-bright">
            {league.name}
          </h1>

          {league.description && (
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-white/85">
              {league.description}
            </p>
          )}

          <div className="mt-5 space-y-1 text-sm">
            {allSessionLabels.length > 0 ? (
              <div className="text-white">
                <span className="text-pickle">📅</span>{" "}
                <strong>{allSessionLabels.length} sessions:</strong>
                <ul className="mt-1 ml-5 list-disc space-y-0.5">
                  {allSessionLabels.map((label, i) => (
                    <li key={i} className="text-white/85">{label}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-white">
                <span className="text-pickle">📅</span> {dateLabel}
              </div>
            )}
            {courtLabel && (
              <div className="text-white/80">
                <span className="text-pickle">📍</span> {courtLabel}
              </div>
            )}
            {courtAddress && (
              <div className="ml-5 text-white/60">{courtAddress}</div>
            )}
            {league.court_rules && (
              <div className="text-white/70">
                <span className="text-pickle">🎾</span> {league.court_rules}
              </div>
            )}
          </div>

          {prizes.length > 0 && (
            <div className="mt-6">
              <div className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
                Prizes
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {prizes.map((p) => (
                  <div
                    key={p.place}
                    className={`rounded-xl border-2 px-3 py-2 ${
                      p.place === 1
                        ? "border-bright bg-bright/5"
                        : "border-pickle/40 bg-pickle/5"
                    }`}
                  >
                    <div className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
                      {p.place === 1 ? "🥇 1st" : p.place === 2 ? "🥈 2nd" : "🥉 3rd"}
                    </div>
                    {p.description && (
                      <div className="mt-1 text-xs text-white/90">
                        {p.description}
                      </div>
                    )}
                    {p.sponsor_name && (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/50">
                        {p.sponsor_name}
                      </div>
                    )}
                    {p.sponsor_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.sponsor_image_url}
                        alt={p.sponsor_name ?? "Sponsor"}
                        className="mt-2 h-12 w-full rounded border-2 border-white/10 bg-black object-contain"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <RsvpClient
            token={token}
            autoAction={
              action === "accept" || action === "decline" ? action : null
            }
            leagueId={id}
          />
        </div>

        <p className="mt-4 text-center text-xs text-white/40">
          PKLRALLY · find &amp; play pickleball games near you
          <br />
          <Link href="/" className="text-pickle hover:underline">
            pklrally.com
          </Link>
        </p>
      </div>
    </div>
  );
}
