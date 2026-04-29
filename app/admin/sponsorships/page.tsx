import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SponsorshipManager from "@/components/admin/SponsorshipManager";
import { citySlug, currentMonthKey, monthLabel } from "@/lib/ladder";

export const dynamic = "force-dynamic";

export default async function AdminSponsorshipsPage() {
  const supabase = await createClient();

  const { data: sponsors } = await supabase
    .from("sponsors")
    .select("id, name, logo_url, website, contact_email, short_description, created_at")
    .order("created_at", { ascending: false });

  const { data: sponsorships } = await supabase
    .from("sponsorships")
    .select(
      `id, sponsor_id, city, state, month_key, status,
       prize_1_title, prize_2_title, prize_3_title,
       prize_image_url, amount_paid_cents, created_at,
       sponsor:sponsors (id, name, logo_url)`,
    )
    .order("month_key", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: cities } = await supabase
    .from("courts")
    .select("city, state")
    .eq("status", "active");

  // Distinct cities for the dropdown
  const cityOptions = Array.from(
    new Map(
      (cities ?? []).map((c) => [
        `${c.state.toUpperCase()}::${c.city.toLowerCase()}`,
        { city: c.city, state: c.state.toUpperCase() },
      ]),
    ).values(),
  ).sort((a, b) =>
    a.state === b.state
      ? a.city.localeCompare(b.city)
      : a.state.localeCompare(b.state),
  );

  const monthKey = currentMonthKey();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Sponsorships
          </h1>
          <p className="mt-2 text-base text-white/60">
            Manually manage sponsors + monthly city sponsorships. Phase 2 will
            move this to a self-serve flow with Stripe.
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-pickle">
            Current month · {monthLabel(monthKey)}
          </p>
        </div>
      </div>

      <SponsorshipManager
        sponsors={sponsors ?? []}
        sponsorships={sponsorships ?? []}
        cityOptions={cityOptions}
      />

      {/* Quick links to live ladders */}
      <section className="mt-10">
        <h2 className="font-display text-display-md font-extrabold text-pickle">
          Live ladder pages
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {cityOptions.map((c) => (
            <Link
              key={`${c.state}-${c.city}`}
              href={`/ladder/${c.state.toLowerCase()}/${citySlug(c.city)}`}
              target="_blank"
              className="rounded-md border-2 border-white/20 px-3 py-1.5 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 transition hover:border-pickle hover:text-pickle"
            >
              {c.city}, {c.state} ↗
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
