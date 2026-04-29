import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  currentMonthKey,
  monthLabel,
  titleCase,
  unslugCity,
  type LadderRow,
} from "@/lib/ladder";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string; city: string }>;
  searchParams: Promise<{ month?: string }>;
}

interface SponsorshipRow {
  id: string;
  prize_1_title: string | null;
  prize_1_description: string | null;
  prize_2_title: string | null;
  prize_2_description: string | null;
  prize_3_title: string | null;
  prize_3_description: string | null;
  prize_image_url: string | null;
  sponsor: {
    id: string;
    name: string;
    logo_url: string | null;
    website: string | null;
    short_description: string | null;
  } | null;
}

export default async function CityLadderPage({
  params,
  searchParams,
}: PageProps) {
  const { state: stateSlug, city: cityParam } = await params;
  const { month } = await searchParams;

  const monthKey = month ?? currentMonthKey();
  const cityName = titleCase(unslugCity(cityParam));
  const stateUpper = stateSlug.toUpperCase();

  const supabase = await createClient();

  // Validate the city actually exists (has at least one court). This
  // prevents random /ladder/zz/nowheresville URLs from rendering.
  const { data: matchingCourts } = await supabase
    .from("courts")
    .select("id, city, state")
    .ilike("city", cityName)
    .ilike("state", stateUpper)
    .limit(1);

  if (!matchingCourts || matchingCourts.length === 0) {
    notFound();
  }

  // Pull the ladder via the security-definer function (migration 0015).
  const { data: ladderData, error: ladderErr } = await supabase.rpc(
    "city_monthly_ladder",
    {
      p_city: cityName,
      p_state: stateUpper,
      p_month_key: monthKey,
    },
  );

  const ladder: LadderRow[] = (ladderData ?? []) as LadderRow[];

  // Pull active sponsorship for the month
  const { data: sponsorship } = await supabase
    .from("sponsorships")
    .select(
      `id,
       prize_1_title, prize_1_description,
       prize_2_title, prize_2_description,
       prize_3_title, prize_3_description,
       prize_image_url,
       sponsor:sponsors (id, name, logo_url, website, short_description)`,
    )
    .ilike("city", cityName)
    .ilike("state", stateUpper)
    .eq("month_key", monthKey)
    .eq("status", "active")
    .maybeSingle();

  const sp = (sponsorship ?? null) as SponsorshipRow | null;
  const sponsor = sp?.sponsor
    ? Array.isArray(sp.sponsor)
      ? sp.sponsor[0]
      : sp.sponsor
    : null;

  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-6 sm:px-6">
      {/* Top nav */}
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle hover:text-bright"
        >
          ← PKLRALLY
        </Link>
        <Link
          href="/ladder"
          className="font-display text-display-xs uppercase font-bold tracking-wide text-white/50 hover:text-pickle"
        >
          All cities
        </Link>
      </div>

      {/* Header */}
      <header className="mx-auto mt-8 max-w-3xl">
        <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          Monthly Ladder
        </p>
        <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
          {cityName}, {stateUpper}
        </h1>
        <p className="mt-1 font-mono text-sm uppercase tracking-wide text-white/60">
          {monthLabel(monthKey)}
        </p>
      </header>

      {/* Sponsor banner */}
      <section className="mx-auto mt-8 max-w-3xl">
        {sponsor ? (
          <div className="overflow-hidden rounded-2xl border-2 border-pickle bg-gradient-to-br from-pickle/20 via-black to-electric/20 p-5">
            <div className="flex items-start gap-4">
              {sponsor.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sponsor.logo_url}
                  alt={sponsor.name}
                  className="h-16 w-16 shrink-0 rounded-xl border-2 border-pickle bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-pickle bg-black">
                  <span className="font-display text-display-lg font-extrabold text-pickle">
                    {sponsor.name[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-display text-[10px] uppercase font-bold tracking-widest text-pickle">
                  Sponsored by
                </p>
                <p className="mt-0.5 font-display text-display-md font-extrabold text-white">
                  {sponsor.website ? (
                    <a
                      href={sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-pickle hover:underline"
                    >
                      {sponsor.name}
                    </a>
                  ) : (
                    sponsor.name
                  )}
                </p>
                {sponsor.short_description && (
                  <p className="mt-1 text-sm text-white/70">
                    {sponsor.short_description}
                  </p>
                )}
              </div>
            </div>

            {(sp?.prize_1_title || sp?.prize_2_title || sp?.prize_3_title) && (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <PrizeCard
                  place="1st"
                  title={sp?.prize_1_title}
                  description={sp?.prize_1_description}
                  accent="text-bright border-bright"
                />
                <PrizeCard
                  place="2nd"
                  title={sp?.prize_2_title}
                  description={sp?.prize_2_description}
                  accent="text-pickle border-pickle"
                />
                <PrizeCard
                  place="3rd"
                  title={sp?.prize_3_title}
                  description={sp?.prize_3_description}
                  accent="text-electric border-electric"
                />
              </div>
            )}

            {sp?.prize_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sp.prize_image_url}
                alt="Prizes"
                className="mt-4 w-full rounded-xl border-2 border-pickle/40 object-cover"
              />
            )}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-white/20 bg-white/[0.02] p-6 text-center">
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              Open sponsorship
            </p>
            <p className="mt-2 text-sm text-white/60">
              No sponsor for {cityName} this month. Local businesses can sponsor
              the ladder, set the prizes, and put their logo here all month.
            </p>
            <a
              href={`mailto:hello@pklrally.com?subject=Sponsor%20${encodeURIComponent(cityName)}%20${monthKey}`}
              className="mt-3 inline-block rounded-md border-2 border-pickle px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-pickle transition hover:bg-pickle hover:text-black"
            >
              Become a sponsor
            </a>
          </div>
        )}
      </section>

      {/* How the ranking works — DARK explainer above the LIGHT list */}
      <section className="mx-auto mt-8 max-w-3xl rounded-2xl border-2 border-white/15 bg-white/[0.03] p-5">
        <h2 className="font-display text-display-sm font-extrabold uppercase tracking-wide text-pickle">
          How the ranking works
        </h2>

        <div className="mt-4 rounded-xl border-2 border-pickle bg-black p-4 text-center">
          <p className="font-mono text-base text-bright sm:text-lg">
            score = weighted&nbsp;wins × win&nbsp;rate
          </p>
          <p className="mt-1 font-mono text-xs text-white/60">
            weighted wins = sum of each win, weighted by team rating gap
          </p>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-white/80">
          Each match&apos;s win is worth{" "}
          <span className="text-pickle">more or less</span> depending on how
          the two teams compared. We average each team&apos;s self-ratings and
          look at the gap. Beating a team rated higher than yours earns a{" "}
          <span className="text-pickle">bonus</span>. Beating a team rated
          lower earns a <span className="text-bright">discount</span>. The
          weight is capped between <span className="font-mono">0.5×</span> and{" "}
          <span className="font-mono">1.5×</span> so one match can&apos;t
          break a month.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          This is designed to close two gaps in a simple wins-based ranking:
        </p>
        <ul className="mt-2 space-y-1.5 pl-1 text-sm leading-relaxed text-white/80">
          <li>
            <span className="font-display text-pickle">Volume alone</span> won&apos;t
            carry you — the win-rate term means a 30–20 month earns about the
            same score as a 12–4 month.
          </li>
          <li>
            <span className="font-display text-pickle">Lower-rated opponents</span>{" "}
            won&apos;t carry you — those wins are discounted, so beating up on
            3.0s when you&apos;re a 4.0 quietly counts less.
          </li>
          <li>
            <span className="font-display text-pickle">Doubles is a team game</span>{" "}
            — both partners get the same multiplier, based on team-average vs.
            team-average. A 4.0 + 3.0 partnership is treated as a 3.5 team.
          </li>
        </ul>

        <p className="mt-5 font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
          Worked examples
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MatchExample
            scenario="Two 3.5s beat two 3.5s, 11–9"
            teams="Team avg 3.5 vs 3.5 → gap 0"
            value="1.00"
            tone="even"
          />
          <MatchExample
            scenario="Two 4.0s beat two 3.5s, 11–7"
            teams="Team avg 4.0 vs 3.5 → gap −0.5"
            value="0.85"
            tone="discount"
          />
          <MatchExample
            scenario="Two 4.0s beat two 3.0s, 11–4"
            teams="Team avg 4.0 vs 3.0 → gap −1.0"
            value="0.70"
            tone="discount"
          />
          <MatchExample
            scenario="A 3.0 + 3.5 team beats a 4.0 + 4.5 team, 11–9"
            teams="Team avg 3.25 vs 4.25 → gap +1.0"
            value="1.30"
            tone="bonus"
          />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-white/50">
          Only <span className="text-pickle">vouched</span> matches count.
          Guests don&apos;t appear on the ladder until they claim their
          account. Score margins (11–7 vs. 11–9) don&apos;t change a
          match&apos;s weight — only the rating gap does. Unrated players
          default to 3.5 for these calculations. Ties broken by weighted wins,
          then total wins, then matches played.
        </p>
      </section>

      {/* LIGHT-themed ranking list */}
      <section className="mx-auto mt-8 max-w-3xl">
        <div className="overflow-hidden rounded-2xl border-2 border-pickle bg-zinc-50 shadow-2xl">
          {/* List header */}
          <div className="flex items-center justify-between border-b-2 border-zinc-200 bg-white px-5 py-3">
            <h2 className="font-display text-display-sm font-extrabold uppercase tracking-wide text-zinc-900">
              {monthLabel(monthKey)} Ladder
            </h2>
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              {ladder.length} player{ladder.length === 1 ? "" : "s"}
            </span>
          </div>

          {ladderErr && (
            <div className="px-5 py-4 text-sm text-red-600">
              ⚠ {ladderErr.message}
            </div>
          )}

          {!ladderErr && ladder.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="font-display text-display-sm font-bold uppercase tracking-wide text-zinc-400">
                No vouched matches yet
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Be the first on the board — log a rally at any {cityName} court
                and get it vouched.
              </p>
            </div>
          )}

          <ul className="divide-y-2 divide-zinc-100">
            {ladder.map((row) => (
              <LadderRowItem key={row.player_id} row={row} />
            ))}
          </ul>
        </div>

        <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-white/40">
          Updates as matches get vouched · top of the board on the last day of
          the month wins
        </p>
      </section>
    </main>
  );
}

function PrizeCard({
  place,
  title,
  description,
  accent,
}: {
  place: string;
  title: string | null | undefined;
  description: string | null | undefined;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border-2 bg-black/50 p-3 ${accent}`}>
      <p className="font-display text-[10px] uppercase font-extrabold tracking-widest">
        {place}
      </p>
      <p className="mt-1 font-display text-display-xs font-bold text-white">
        {title || "—"}
      </p>
      {description && (
        <p className="mt-1 text-xs text-white/60">{description}</p>
      )}
    </div>
  );
}

function MatchExample({
  scenario,
  teams,
  value,
  tone,
}: {
  scenario: string;
  teams: string;
  value: string;
  tone: "even" | "discount" | "bonus";
}) {
  const styles = {
    even: {
      border: "border-white/25",
      bg: "bg-black/40",
      label: "text-white/60",
      labelText: "Even matchup",
      valueColor: "text-white",
    },
    discount: {
      border: "border-bright/40",
      bg: "bg-bright/5",
      label: "text-bright",
      labelText: "Discounted",
      valueColor: "text-bright",
    },
    bonus: {
      border: "border-pickle",
      bg: "bg-pickle/10",
      label: "text-pickle",
      labelText: "Bonus (upset)",
      valueColor: "text-pickle",
    },
  }[tone];

  return (
    <div className={`rounded-xl border-2 p-3 ${styles.border} ${styles.bg}`}>
      <p
        className={`font-display text-[10px] uppercase font-bold tracking-widest ${styles.label}`}
      >
        {styles.labelText}
      </p>
      <p className="mt-1 text-sm leading-snug text-white">{scenario}</p>
      <p className="mt-1 font-mono text-xs text-white/60">{teams}</p>
      <p className="mt-2 font-mono text-xs text-white/50">
        win counts as{" "}
        <span className={`text-base font-bold ${styles.valueColor}`}>
          {value}
        </span>
      </p>
    </div>
  );
}

function LadderRowItem({ row }: { row: LadderRow }) {
  const rankBadge = rankBadgeStyle(row.rank);
  const winRatePct = Math.round(row.win_rate * 100);

  return (
    <li>
      <Link
        href={`/profile/${row.player_id}`}
        className="flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-100"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-mono text-base font-bold ${rankBadge}`}
        >
          {row.rank}
        </span>
        <Avatar
          player={{
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            avatar_focal_x: row.avatar_focal_x,
            avatar_focal_y: row.avatar_focal_y,
            is_guest: false,
          }}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-zinc-900">
            {row.display_name}
          </p>
          {row.username && (
            <p className="truncate font-mono text-xs text-zinc-500">
              @{row.username}
            </p>
          )}
        </div>
        <div className="hidden gap-4 text-center sm:flex">
          <Stat label="W" value={row.wins.toString()} color="text-emerald-600" />
          <Stat label="L" value={row.losses.toString()} color="text-rose-500" />
          <Stat
            label="Win %"
            value={`${winRatePct}%`}
            color="text-zinc-700"
          />
        </div>
        <div className="ml-2 text-right">
          <p className="font-mono text-xl font-extrabold text-zinc-900 sm:text-2xl">
            {row.score.toFixed(2)}
          </p>
          <p className="font-display text-[10px] uppercase font-bold tracking-widest text-zinc-500">
            score
          </p>
        </div>
      </Link>

      {/* Mobile-only stat strip — fits under the row */}
      <div className="flex justify-around border-t border-zinc-100 bg-zinc-100/50 px-5 py-2 sm:hidden">
        <Stat label="W" value={row.wins.toString()} color="text-emerald-600" />
        <Stat label="L" value={row.losses.toString()} color="text-rose-500" />
        <Stat
          label="Win %"
          value={`${winRatePct}%`}
          color="text-zinc-700"
        />
        <Stat
          label="Played"
          value={row.matches_played.toString()}
          color="text-zinc-500"
        />
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <p className={`font-mono text-base font-bold ${color}`}>{value}</p>
      <p className="font-display text-[9px] uppercase font-bold tracking-widest text-zinc-500">
        {label}
      </p>
    </div>
  );
}

function rankBadgeStyle(rank: number): string {
  // Gold / silver / bronze for top 3, neutral for the rest.
  if (rank === 1) return "border-amber-400 bg-amber-300 text-amber-900";
  if (rank === 2) return "border-zinc-400 bg-zinc-200 text-zinc-700";
  if (rank === 3) return "border-orange-400 bg-orange-200 text-orange-800";
  return "border-zinc-300 bg-white text-zinc-600";
}
