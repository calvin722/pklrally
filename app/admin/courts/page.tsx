import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CourtRowActions from "@/components/admin/CourtRowActions";

export const dynamic = "force-dynamic";

export default async function AdminCourtsPage() {
  const supabase = await createClient();

  const { data: courts, error } = await supabase
    .from("courts")
    .select("id, name, address, city, state, type, status, created_at")
    // Pending first, then active, then inactive — admin's eye lands on
    // what needs review without sorting.
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const pending = (courts ?? []).filter((c) => c.status === "pending_review");
  const active = (courts ?? []).filter((c) => c.status === "active");
  const inactive = (courts ?? []).filter(
    (c) => c.status !== "active" && c.status !== "pending_review",
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Courts
          </h1>
          <p className="mt-2 text-base text-white/60">
            {pending.length > 0
              ? `${pending.length} pending review · ${active.length} active`
              : `${active.length} active`}
          </p>
        </div>
        <Link
          href="/admin/courts/new"
          className="soft-stamp rounded-xl bg-pickle px-5 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black"
        >
          + Add court
        </Link>
      </div>

      {error && <p className="mt-4 text-base text-bright">⚠ {error.message}</p>}

      {/* Pending review section — separated so admin sees them clearly */}
      {pending.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <span className="font-display text-display-xs uppercase font-extrabold tracking-wide text-bright">
              ⚠ Awaiting your review
            </span>
            <span className="rounded-full bg-bright px-2 py-0.5 font-mono text-xs font-bold text-black">
              {pending.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border-2 border-bright neon-bright">
            <CourtsTable rows={pending} showActions />
          </div>
        </section>
      )}

      {/* Active courts */}
      <section className="mt-8">
        <div className="mb-3 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
          Active ({active.length})
        </div>
        <div className="overflow-hidden rounded-2xl border-2 border-pickle">
          <CourtsTable rows={active} showActions />
        </div>
      </section>

      {/* Inactive */}
      {inactive.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 font-display text-display-xs uppercase font-semibold tracking-wide text-white/40">
            Inactive ({inactive.length})
          </div>
          <div className="overflow-hidden rounded-2xl border-2 border-white/20">
            <CourtsTable rows={inactive} showActions />
          </div>
        </section>
      )}
    </div>
  );
}

interface CourtRow {
  id: string;
  name: string;
  address: string | null;
  city: string;
  state: string;
  type: "public" | "private";
  status: string;
}

function CourtsTable({
  rows,
  showActions,
}: {
  rows: CourtRow[];
  showActions: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-white/50">
        No courts in this section.
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-base">
      <thead className="bg-pickle text-black">
        <tr>
          <Th>Name</Th>
          <Th>City</Th>
          <Th>State</Th>
          <Th>Type</Th>
          {showActions && <Th>Actions</Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-t-2 border-pickle/30">
            <Td>
              <div className="font-medium">{c.name}</div>
              {c.address && (
                <div className="mt-0.5 text-xs text-white/50">{c.address}</div>
              )}
            </Td>
            <Td>{c.city}</Td>
            <Td>{c.state}</Td>
            <Td>
              <span
                className={
                  c.type === "private" ? "text-electric" : "text-pickle"
                }
              >
                {c.type}
              </span>
            </Td>
            {showActions && (
              <Td>
                <CourtRowActions courtId={c.id} status={c.status} />
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-white">{children}</td>;
}
