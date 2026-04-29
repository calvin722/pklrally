import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MatchRowActions from "@/components/admin/MatchRowActions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_TABS = [
  { key: undefined, label: "All" },
  { key: "pending", label: "Pending" },
  { key: "vouched", label: "Vouched" },
  { key: "disputed", label: "Disputed" },
  { key: "unverified_all_guest", label: "Unverified" },
  { key: "admin_deleted", label: "Cancelled" },
];

const STATUS_COLOR: Record<string, string> = {
  pending: "text-bright",
  vouched: "text-pickle",
  disputed: "text-electric",
  unverified_all_guest: "text-white/50",
  admin_deleted: "text-white/30",
};

export default async function AdminMatchesPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("matches")
    .select(
      `id, played_at, status, server_score, receiver_score, logged_by,
       court:courts (name, city, state),
       server_team_p1:players!matches_server_team_p1_fkey (id, display_name),
       server_team_p2:players!matches_server_team_p2_fkey (id, display_name),
       receiver_team_p1:players!matches_receiver_team_p1_fkey (id, display_name),
       receiver_team_p2:players!matches_receiver_team_p2_fkey (id, display_name),
       logger:players!matches_logged_by_fkey (id, display_name)`,
    )
    .order("played_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data: matches, error } = await query;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Matches
          </h1>
          <p className="mt-2 text-base text-white/60">
            {matches?.length ?? 0} match{(matches?.length ?? 0) === 1 ? "" : "es"}
            {status && ` · status = ${status}`} (cap 200)
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border-2 border-white/30 p-1">
          {STATUS_TABS.map((t) => {
            const href = t.key
              ? `/admin/matches?status=${t.key}`
              : "/admin/matches";
            const active = (status ?? "all") === (t.key ?? "all");
            return (
              <Link
                key={t.label}
                href={href}
                className={`rounded-md px-3 py-1.5 font-display text-display-xs font-semibold uppercase tracking-wide transition ${
                  active
                    ? "bg-pickle text-black"
                    : "text-white/60 hover:text-pickle"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-4 text-base text-bright">⚠ {error.message}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-pickle text-black">
            <tr>
              <Th>When</Th>
              <Th>Court</Th>
              <Th>Score</Th>
              <Th>Players</Th>
              <Th>Logger</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(matches ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/50">
                  No matches in this filter.
                </td>
              </tr>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {((matches ?? []) as any[]).map((m) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const j = (v: any) => (Array.isArray(v) ? v[0] : v);
              const court = j(m.court);
              const logger = j(m.logger);
              const players = [
                j(m.server_team_p1),
                j(m.server_team_p2),
                j(m.receiver_team_p1),
                j(m.receiver_team_p2),
              ]
                .filter(Boolean)
                .map((p) => p.display_name);
              return (
                <tr key={m.id} className="border-t-2 border-pickle/30">
                  <Td>
                    <span className="font-mono text-xs text-white/70">
                      {new Date(m.played_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </Td>
                  <Td>
                    {court ? (
                      <span className="text-white">
                        {court.name}
                        <div className="text-xs text-white/50">
                          {court.city}, {court.state}
                        </div>
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-base text-white">
                      {m.server_score} – {m.receiver_score}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-white/70">
                      {players.join(", ")}
                    </span>
                  </Td>
                  <Td>
                    {logger ? (
                      <Link
                        href={`/profile/${logger.id}`}
                        className="text-pickle hover:underline"
                      >
                        {logger.display_name}
                      </Link>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </Td>
                  <Td>
                    <span
                      className={`font-display text-display-xs uppercase font-bold tracking-wide ${
                        STATUS_COLOR[m.status] ?? "text-white"
                      }`}
                    >
                      {m.status.replace(/_/g, " ")}
                    </span>
                  </Td>
                  <Td>
                    <MatchRowActions matchId={m.id} status={m.status} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
