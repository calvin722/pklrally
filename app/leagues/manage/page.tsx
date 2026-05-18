import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

export const dynamic = "force-dynamic";

export default async function ManageLeaguesPage() {
  const me = await getCurrentPlayer();
  if (!me) redirect("/login?next=/leagues/manage");

  const supabase = await createClient();
  const { data: leagues } = await supabase
    .from("leagues")
    .select(
      "id, name, status, current_round, n_rounds, scheduled_at, description",
    )
    .eq("created_by", me.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = (leagues ?? []).map((l) => l.id);

  // Counts: players + invites broken down by status
  const { data: playerRows } = ids.length
    ? await supabase.from("league_players").select("league_id").in("league_id", ids)
    : { data: [] as { league_id: string }[] };
  const playerCount = new Map<string, number>();
  for (const r of playerRows ?? [])
    playerCount.set(r.league_id, (playerCount.get(r.league_id) ?? 0) + 1);

  const { data: inviteRows } = ids.length
    ? await supabase
        .from("league_invites")
        .select("league_id, status")
        .in("league_id", ids)
    : { data: [] as { league_id: string; status: string }[] };
  const inviteCounts = new Map<
    string,
    { pending: number; accepted: number; declined: number }
  >();
  for (const r of inviteRows ?? []) {
    const cur = inviteCounts.get(r.league_id) ?? {
      pending: 0,
      accepted: 0,
      declined: 0,
    };
    if (r.status === "pending") cur.pending++;
    else if (r.status === "accepted") cur.accepted++;
    else if (r.status === "declined") cur.declined++;
    inviteCounts.set(r.league_id, cur);
  }

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/leagues"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Leagues
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-display-2xl font-extrabold text-bright">
              Manage My Leagues
            </h1>
            <p className="mt-2 text-base text-white/60">
              Leagues you created. Click in to add players, send invites, run
              rounds, or see standings.
            </p>
          </div>
          <Link
            href="/leagues/new"
            className="rounded-lg bg-pickle px-5 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-bright"
          >
            + Start a Ladder League
          </Link>
        </div>

        <div className="mt-6 space-y-4">
          {(leagues ?? []).length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-white/20 p-12 text-center text-white/50">
              You haven&rsquo;t created any leagues yet.{" "}
              <Link href="/leagues/new" className="text-pickle hover:underline">
                Start your first one →
              </Link>
            </div>
          )}
          {(leagues ?? []).map((l) => {
            const counts = inviteCounts.get(l.id) ?? {
              pending: 0,
              accepted: 0,
              declined: 0,
            };
            const dateLabel = l.scheduled_at
              ? new Date(l.scheduled_at).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : null;
            return (
              <Link
                key={l.id}
                href={`/leagues/${l.id}`}
                className="block rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-5 transition hover:border-pickle hover:bg-pickle/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-display-lg font-extrabold text-bright">
                      {l.name}
                    </h2>
                    {dateLabel && (
                      <p className="mt-1 text-sm text-white/70">
                        📅 {dateLabel}
                      </p>
                    )}
                    {l.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-white/60">
                        {l.description}
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    status={l.status}
                    round={l.current_round}
                    total={l.n_rounds}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Stat label="Players" value={playerCount.get(l.id) ?? 0} color="text-pickle" />
                  <Stat label="Joining" value={counts.accepted} color="text-pickle" />
                  <Stat label="Pending" value={counts.pending} color="text-white/80" />
                  <Stat label="Declined" value={counts.declined} color="text-white/40" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border-2 border-white/15 px-3 py-1.5 text-center">
      <div className={`font-display text-display-sm font-extrabold ${color}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-white/50">
        {label}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  round,
  total,
}: {
  status: string;
  round: number;
  total: number;
}) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    setup: { label: "Setup", bg: "bg-white/10", fg: "text-white" },
    in_progress: {
      label: `Round ${round} / ${total}`,
      bg: "bg-pickle",
      fg: "text-black",
    },
    finished: { label: "Finished", bg: "bg-bright", fg: "text-black" },
    cancelled: { label: "Cancelled", bg: "bg-white/20", fg: "text-white/50" },
  };
  const m = map[status] ?? map.setup;
  return (
    <span
      className={`rounded-full px-4 py-1.5 font-display text-display-xs uppercase font-bold tracking-wide ${m.bg} ${m.fg}`}
    >
      {m.label}
    </span>
  );
}
