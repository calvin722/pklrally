import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_TABS = [
  { key: undefined, label: "All" },
  { key: "in_progress", label: "Live" },
  { key: "setup", label: "Setup" },
  { key: "finished", label: "Finished" },
];

const STATUS_COLOR: Record<string, string> = {
  setup: "text-white/70",
  in_progress: "text-pickle",
  finished: "text-bright",
  cancelled: "text-white/40",
};

export default async function LeaguesIndexPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const me = await getCurrentPlayer();

  let query = supabase
    .from("leagues")
    .select(
      `id, name, status, current_round, n_rounds, n_courts, court_rules, created_by, created_at,
       creator:players!leagues_created_by_fkey (id, display_name)`,
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);

  const { data: leagues, error } = await query;

  // Player counts per league
  const ids = (leagues ?? []).map((l) => l.id);
  const { data: playerRows } = ids.length
    ? await supabase.from("league_players").select("league_id").in("league_id", ids)
    : { data: [] as { league_id: string }[] };
  const count = new Map<string, number>();
  for (const r of playerRows ?? [])
    count.set(r.league_id, (count.get(r.league_id) ?? 0) + 1);

  return (
    <div className="min-h-svh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/"
              className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
            >
              ◀ Home
            </Link>
            <h1 className="mt-2 font-display text-display-2xl font-extrabold text-bright">
              Leagues
            </h1>
            <p className="mt-2 text-base text-white/60">
              {leagues?.length ?? 0} league{(leagues?.length ?? 0) === 1 ? "" : "s"}
              {status ? ` · ${status}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg border-2 border-white/30 p-1">
              {STATUS_TABS.map((t) => {
                const href = t.key ? `/leagues?status=${t.key}` : "/leagues";
                const active = (status ?? "all") === (t.key ?? "all");
                return (
                  <Link
                    key={t.label}
                    href={href}
                    className={`rounded-md px-3 py-1.5 font-display text-display-xs font-semibold uppercase tracking-wide transition ${
                      active ? "bg-pickle text-black" : "text-white/60 hover:text-pickle"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
            {me && (
              <Link
                href="/leagues/new"
                className="rounded-lg bg-pickle px-5 py-2 font-display text-display-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-bright"
              >
                + New League
              </Link>
            )}
          </div>
        </div>

        {error && <p className="mt-4 text-base text-bright">⚠ {error.message}</p>}

        <div className="mt-6 overflow-hidden rounded-2xl border-2 border-pickle">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-pickle text-black">
              <tr>
                <Th>League</Th>
                <Th>Status</Th>
                <Th>Players</Th>
                <Th>Format</Th>
                <Th>Created by</Th>
              </tr>
            </thead>
            <tbody>
              {(leagues ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/50">
                    No leagues yet. {me ? "Create the first one!" : "Sign in to create one."}
                  </td>
                </tr>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {((leagues ?? []) as any[]).map((l) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const j = (v: any) => (Array.isArray(v) ? v[0] : v);
                const creator = j(l.creator);
                return (
                  <tr key={l.id} className="border-t-2 border-pickle/30">
                    <Td>
                      <Link href={`/leagues/${l.id}`} className="text-pickle hover:underline">
                        {l.name}
                      </Link>
                      {l.court_rules && (
                        <div className="text-xs text-white/50">{l.court_rules}</div>
                      )}
                    </Td>
                    <Td>
                      <span
                        className={`font-display text-display-xs font-bold uppercase tracking-wide ${
                          STATUS_COLOR[l.status] ?? "text-white"
                        }`}
                      >
                        {l.status === "in_progress"
                          ? `Round ${l.current_round}/${l.n_rounds}`
                          : l.status}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-base text-white">
                        {count.get(l.id) ?? 0}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-white/70">
                        {l.n_courts} courts · {l.n_rounds} rounds
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-white/70">
                        {creator?.display_name ?? "—"}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-3 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>;
}
