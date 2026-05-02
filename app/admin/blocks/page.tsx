import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminBlockRow from "@/components/admin/AdminBlockRow";
import { citySlug } from "@/lib/ladder";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_TABS = [
  { key: undefined, label: "All" },
  { key: "open", label: "Open" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_COLOR: Record<string, string> = {
  open: "text-pickle",
  cancelled: "text-white/40",
};

export default async function AdminBlocksPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("open_play_blocks")
    .select(
      `id, court_id, created_by, starts_at, ends_at, notes, status, created_at,
       court:courts (id, name, city, state, timezone),
       creator:players!open_play_blocks_created_by_fkey (id, display_name, username)`,
    )
    .order("starts_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data: blocks, error } = await query;

  // Pull attendee counts per block (single round-trip, then group)
  const blockIds = (blocks ?? []).map((b) => b.id);
  const { data: attendeeRows } = blockIds.length
    ? await supabase
        .from("open_play_attendees")
        .select("block_id")
        .in("block_id", blockIds)
    : { data: [] as { block_id: string }[] };

  const attendeeCount = new Map<string, number>();
  for (const a of attendeeRows ?? []) {
    attendeeCount.set(a.block_id, (attendeeCount.get(a.block_id) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Open Play Blocks
          </h1>
          <p className="mt-2 text-base text-white/60">
            {blocks?.length ?? 0} block{(blocks?.length ?? 0) === 1 ? "" : "s"}
            {status ? ` · status = ${status}` : ""} (cap 200)
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border-2 border-white/30 p-1">
          {STATUS_TABS.map((t) => {
            const href = t.key
              ? `/admin/blocks?status=${t.key}`
              : "/admin/blocks";
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
              <Th>Creator</Th>
              <Th>Going</Th>
              <Th>Notes</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(blocks ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/50">
                  No blocks in this filter.
                </td>
              </tr>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {((blocks ?? []) as any[]).map((b) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const j = (v: any) => (Array.isArray(v) ? v[0] : v);
              const court = j(b.court);
              const creator = j(b.creator);
              const tz = court?.timezone ?? "America/Denver";
              const startStr = new Date(b.starts_at).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: tz,
                timeZoneName: "short",
              });
              const endStr = new Date(b.ends_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: tz,
              });
              const cityHref =
                court &&
                `/play/${String(court.state).toLowerCase()}/${citySlug(String(court.city))}/${court.id}`;
              return (
                <tr key={b.id} className="border-t-2 border-pickle/30">
                  <Td>
                    <span className="font-mono text-xs text-white/85">
                      {startStr}
                    </span>
                    <div className="font-mono text-[10px] text-white/40">
                      until {endStr}
                    </div>
                  </Td>
                  <Td>
                    {court ? (
                      cityHref ? (
                        <Link
                          href={cityHref}
                          target="_blank"
                          className="text-pickle hover:underline"
                        >
                          {court.name}
                        </Link>
                      ) : (
                        <span className="text-white">{court.name}</span>
                      )
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                    <div className="text-xs text-white/50">
                      {court ? `${court.city}, ${court.state}` : ""}
                    </div>
                  </Td>
                  <Td>
                    {creator ? (
                      <Link
                        href={`/profile/${creator.id}`}
                        className="text-pickle hover:underline"
                      >
                        {creator.display_name}
                      </Link>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-base text-white">
                      {attendeeCount.get(b.id) ?? 0}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-white/70">
                      {b.notes ?? <span className="text-white/30">—</span>}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`font-display text-display-xs uppercase font-bold tracking-wide ${
                        STATUS_COLOR[b.status] ?? "text-white"
                      }`}
                    >
                      {b.status}
                    </span>
                  </Td>
                  <Td>
                    <AdminBlockRow blockId={b.id} />
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
