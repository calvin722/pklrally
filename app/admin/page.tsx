import { createClient } from "@/lib/supabase/server";
import LeagueMonthControl from "@/components/admin/LeagueMonthControl";
import { currentMonthKey } from "@/lib/ladder";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { count: playerCount },
    { count: courtCount },
    { count: matchCount },
    { data: overrideRow },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("is_guest", false),
    supabase
      .from("courts")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .gte(
        "played_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "league_month_override")
      .maybeSingle(),
  ]);

  const override =
    typeof overrideRow?.value === "string" && overrideRow.value
      ? overrideRow.value
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-display-2xl font-extrabold text-bright">
          Dashboard
        </h1>
        <p className="mt-2 text-base text-white/60">
          Operational pulse for PKLRALLY.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Members" value={playerCount ?? 0} />
          <Stat label="Active courts" value={courtCount ?? 0} />
          <Stat label="Matches (7d)" value={matchCount ?? 0} />
        </div>
      </div>

      <LeagueMonthControl
        currentOverride={override}
        calendarMonthKey={currentMonthKey()}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-pickle bg-black p-5 neon-pickle">
      <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
        {label}
      </div>
      <div className="mt-2 font-mono text-display-2xl font-bold text-white">
        {value}
      </div>
    </div>
  );
}
