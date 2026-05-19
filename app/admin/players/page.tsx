import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminPlayersTable from "@/components/admin/AdminPlayersTable";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string; type?: string }>;
}

export default async function AdminPlayersPage({ searchParams }: PageProps) {
  const { q, type } = await searchParams;
  const supabase = await createClient();
  const me = await getCurrentPlayer();

  let query = supabase
    .from("players")
    .select(
      "id, display_name, username, email, city, state, dupr_self_rating, is_admin, is_guest, claimed_at, onboarding_completed_at, matches_played, wins, losses, avatar_url, avatar_focal_x, avatar_focal_y, deleted_at, created_at",
    )
    // Hide soft-deleted rows from the admin list entirely (Calvin's call —
    // they were just visual noise).
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (type === "members") query = query.eq("is_guest", false);
  if (type === "guests") query = query.eq("is_guest", true);
  if (type === "admins") query = query.eq("is_admin", true);
  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(
      [
        `display_name.ilike.%${term}%`,
        `username.ilike.%${term}%`,
        `email.ilike.%${term}%`,
      ].join(","),
    );
  }

  const { data: players, error } = await query;
  const total = players?.length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display-2xl font-extrabold text-bright">
            Players
          </h1>
          <p className="mt-2 text-base text-white/60">
            {total} {type ? type : "total"} (cap 200)
          </p>
        </div>
        <FilterTabs current={type} />
      </div>

      <form className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, username, email..."
          className="flex-1 rounded-lg border-2 border-white bg-black px-4 py-2.5 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none"
        />
        {type && <input type="hidden" name="type" value={type} />}
        <button
          type="submit"
          className="rounded-lg border-2 border-pickle bg-black px-4 py-2.5 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle hover:bg-pickle hover:text-black"
        >
          Search
        </button>
      </form>

      {error && <p className="mt-4 text-base text-bright">⚠ {error.message}</p>}

      <AdminPlayersTable
        players={(players ?? []) as unknown as Parameters<
          typeof AdminPlayersTable
        >[0]["players"]}
        currentPlayerId={me?.id ?? null}
      />
    </div>
  );
}

function FilterTabs({ current }: { current: string | undefined }) {
  const tabs: { key: string | undefined; label: string }[] = [
    { key: undefined, label: "All" },
    { key: "members", label: "Members" },
    { key: "guests", label: "Guests" },
    { key: "admins", label: "Admins" },
  ];
  return (
    <div className="flex gap-1 rounded-lg border-2 border-white/30 p-1">
      {tabs.map((t) => {
        const href = t.key ? `/admin/players?type=${t.key}` : "/admin/players";
        const active = (current ?? "all") === (t.key ?? "all");
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
  );
}
