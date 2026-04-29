import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import SettingsClient from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/settings");

  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle hover:text-bright"
        >
          ← PKLRALLY
        </Link>

        <header className="mt-8">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            Settings
          </p>
          <h1 className="mt-1 font-display text-display-2xl font-extrabold uppercase tracking-tight text-bright sm:text-display-3xl">
            {player.display_name}
          </h1>
        </header>

        <SettingsClient
          playerId={player.id}
          initialTheme={player.theme === "light" ? "light" : "dark"}
        />
      </div>
    </main>
  );
}
