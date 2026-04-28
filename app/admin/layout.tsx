import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const player = await getCurrentPlayer();

  if (!player) redirect("/login?next=/admin");
  if (!player.is_admin) redirect("/?error=admin_required");

  return (
    <div className="grid min-h-svh grid-cols-[220px_1fr] bg-black text-white">
      <aside className="border-r-2 border-pickle/40 bg-black p-5">
        <Link
          href="/"
          className="block font-display text-display-lg font-extrabold leading-none text-pickle"
        >
          PKL<span className="text-bright">RALLY</span>
        </Link>
        <p className="mt-1 mb-8 font-display text-display-xs uppercase font-semibold tracking-wide text-bright">
          Admin
        </p>

        <nav className="space-y-1">
          <NavLink href="/admin">Dashboard</NavLink>
          <NavLink href="/admin/courts">Courts</NavLink>
          <NavLink href="/admin/players">Players</NavLink>
          <NavLink href="/admin/matches">Matches</NavLink>
          <NavLink href="/admin/invites">Invites</NavLink>
        </nav>

        <div className="mt-12 border-t-2 border-white/20 pt-4">
          <Link
            href="/"
            className="block font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
          >
            ◀ Back to map
          </Link>
        </div>
      </aside>

      <main className="overflow-y-auto p-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border-2 border-transparent px-4 py-2 text-base text-white transition hover:border-pickle hover:text-pickle"
    >
      {children}
    </Link>
  );
}
