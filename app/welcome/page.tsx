import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import WelcomeFlow from "@/components/welcome/WelcomeFlow";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/welcome");
  if (player.onboarding_completed_at) redirect("/");

  return (
    <main className="flex min-h-svh items-center justify-center bg-black p-4 grid-bg">
      <div className="w-full max-w-xl rounded-2xl border-2 border-pickle bg-black p-8 neon-pickle">
        <Wordmark size="lg" priority />
        <h1 className="sr-only">PKLRALLY</h1>
        <p className="mt-1 text-sm text-white/60">Play, Track &amp; Win</p>

        <div className="mt-8">
          <WelcomeFlow
            playerId={player.id}
            initialUsername={player.username}
            initialFirstName={player.first_name}
            initialLastName={player.last_name}
            initialNamePublic={player.name_public}
            initialDupr={player.dupr_self_rating}
          />
        </div>
      </div>
    </main>
  );
}
