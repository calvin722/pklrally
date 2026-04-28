import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminCourtsPage() {
  const supabase = await createClient();

  const { data: courts, error } = await supabase
    .from("courts")
    .select("id, name, city, state, type, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Courts
          </h1>
          <p className="mt-2 text-base text-white/60">
            {courts?.length ?? 0} total
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

      <div className="mt-8 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-base">
          <thead className="bg-pickle text-black">
            <tr>
              <Th>Name</Th>
              <Th>City</Th>
              <Th>State</Th>
              <Th>Type</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {courts?.length ? (
              courts.map((c) => (
                <tr key={c.id} className="border-t-2 border-pickle/30">
                  <Td>{c.name}</Td>
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
                  <Td>{c.status}</Td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-white/50"
                >
                  No courts yet. Click + Add court to create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
  return <td className="px-4 py-3 text-white">{children}</td>;
}
