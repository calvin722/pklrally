import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import WelcomeFlow from "@/components/welcome/WelcomeFlow";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/welcome");
  if (player.onboarding_completed_at) redirect("/");

  return (
    <main className="flex min-h-svh items-center justify-center bg-black p-4 grid-bg">
      <div className="w-full max-w-xl rounded-2xl border-2 border-pickle bg-black p-8 neon-pickle">
        <h1 className="font-display text-display-xl font-extrabold leading-none text-pickle">
          PKL<span className="text-bright">RALLY</span>
        </h1>
        <p className="mt-1 text-sm text-white/60">the live pulse of pickleball</p>

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
