import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import AdminPlayerActions from "@/components/admin/AdminPlayerActions";
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

      <div className="mt-6 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-base">
          <thead className="bg-pickle text-black">
            <tr>
              <Th>Player</Th>
              <Th>Email</Th>
              <Th>Location</Th>
              <Th>DUPR</Th>
              <Th>W / L</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(players ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/50">
                  No players match.
                </td>
              </tr>
            )}
            {(players ?? []).map((p) => (
              <tr key={p.id} className="border-t-2 border-pickle/30">
                <Td>
                  <Link
                    href={`/profile/${p.id}`}
                    className="flex items-center gap-2 hover:text-pickle"
                  >
                    <Avatar player={p} size="xs" />
                    <span>
                      <span className="font-medium">{p.display_name}</span>
                      {p.username && (
                        <span className="ml-1 text-xs text-white/50">
                          @{p.username}
                        </span>
                      )}
                    </span>
                  </Link>
                </Td>
                <Td>
                  <span className="text-sm text-white/70">
                    {p.email ?? "—"}
                  </span>
                </Td>
                <Td>
                  {p.city || p.state ? (
                    <span className="text-sm text-white/70">
                      {[p.city, p.state].filter(Boolean).join(", ")}
                    </span>
                  ) : (
                    <span className="text-sm text-white/30">—</span>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-sm text-pickle">
                    {p.dupr_self_rating !== null
                      ? Number(p.dupr_self_rating).toFixed(2)
                      : "—"}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono text-sm text-white/80">
                    {p.wins} / {p.losses}
                  </span>
                </Td>
                <Td>
                  <PlayerBadges player={p} />
                </Td>
                <Td>
                  <AdminPlayerActions
                    playerId={p.id}
                    displayName={p.display_name}
                    isAdmin={p.is_admin}
                    isYou={me?.id === p.id}
                    alreadyDeleted={p.deleted_at !== null}
                    isGuest={p.is_guest}
                    email={p.email}
                    claimedAt={p.claimed_at}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

interface PlayerBadgesProps {
  player: {
    is_admin: boolean;
    is_guest: boolean;
    claimed_at: string | null;
    onboarding_completed_at: string | null;
  };
}

function PlayerBadges({ player }: PlayerBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {player.is_admin && <Badge color="bright">Admin</Badge>}
      {player.is_guest && <Badge color="electric">Guest</Badge>}
      {player.claimed_at && <Badge color="pickle">Claimed</Badge>}
      {!player.is_guest && !player.onboarding_completed_at && (
        <Badge color="white">Pending onboarding</Badge>
      )}
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "pickle" | "electric" | "bright" | "white";
  children: React.ReactNode;
}) {
  const cls = {
    pickle: "border-pickle text-pickle",
    electric: "border-electric text-electric",
    bright: "border-bright text-bright",
    white: "border-white/40 text-white/60",
  }[color];
  return (
    <span
      className={`inline-block rounded-full border ${cls} px-2 py-0.5 font-display text-[10px] uppercase font-semibold tracking-wider`}
    >
      {children}
    </span>
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
