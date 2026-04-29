import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminInvitesPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const supabase = await createClient();

  // Invites are guest player rows that have an email. Status:
  //   - claimed: claimed_at IS NOT NULL (they signed up + got their stats)
  //   - pending: still a guest with no claim
  let query = supabase
    .from("players")
    .select(
      "id, display_name, email, claimed_at, created_at, matches_played, wins, losses",
    )
    .eq("is_guest", true)
    .not("email", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status === "claimed") query = query.not("claimed_at", "is", null);
  if (status === "pending") query = query.is("claimed_at", null);

  const { data: invites, error } = await query;

  const total = invites?.length ?? 0;
  const claimedCount = (invites ?? []).filter((i) => i.claimed_at).length;
  const pendingCount = total - claimedCount;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Invites
          </h1>
          <p className="mt-2 text-base text-white/60">
            {pendingCount} pending · {claimedCount} claimed (cap 200)
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border-2 border-white/30 p-1">
          {[
            { key: undefined, label: "All" },
            { key: "pending", label: "Pending" },
            { key: "claimed", label: "Claimed" },
          ].map((t) => {
            const href = t.key
              ? `/admin/invites?status=${t.key}`
              : "/admin/invites";
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
        <table className="w-full border-collapse text-base">
          <thead className="bg-pickle text-black">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Sent</Th>
              <Th>Status</Th>
              <Th>Stats accrued</Th>
            </tr>
          </thead>
          <tbody>
            {total === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/50">
                  No invites yet. They get created when a logger uses "Send
                  email invite" in Start Rally.
                </td>
              </tr>
            )}
            {(invites ?? []).map((i) => (
              <tr key={i.id} className="border-t-2 border-pickle/30">
                <Td>
                  <Link
                    href={`/profile/${i.id}`}
                    className="text-white hover:text-pickle"
                  >
                    {i.display_name}
                  </Link>
                </Td>
                <Td>
                  <a
                    href={`mailto:${i.email}`}
                    className="text-sm text-pickle hover:underline"
                  >
                    {i.email}
                  </a>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-white/70">
                    {new Date(i.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </Td>
                <Td>
                  {i.claimed_at ? (
                    <span className="rounded-full border border-pickle px-2 py-0.5 font-display text-[10px] uppercase font-semibold tracking-wider text-pickle">
                      Claimed
                    </span>
                  ) : (
                    <span className="rounded-full border border-bright px-2 py-0.5 font-display text-[10px] uppercase font-semibold tracking-wider text-bright">
                      Pending
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-sm text-white/80">
                    {i.matches_played}M · {i.wins}W · {i.losses}L
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/40">
        When a guest signs up using the same email we sent the invite to, the
        existing trigger (<code className="font-mono">handle_new_auth_user</code>)
        auto-claims their guest row. The match stats they accrued as a guest
        become theirs immediately.
      </p>
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
  return <td className="px-4 py-3 align-middle text-white">{children}</td>;
}
