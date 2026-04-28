import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import OnboardingForm from "@/components/welcome/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/welcome");
  if (player.onboarding_completed_at) redirect("/");

  return (
    <main className="flex min-h-svh items-center justify-center bg-black p-4 grid-bg">
      <div className="w-full max-w-md rounded-2xl border-2 border-pickle bg-black p-8 neon-pickle">
        <h1 className="font-display text-display-xl font-extrabold leading-none text-pickle">
          PKL<span className="text-bright">RALLY</span>
        </h1>
        <p className="mt-1 text-sm text-white/60">welcome to the live pulse</p>

        <h2 className="mt-8 font-display text-display-lg font-extrabold text-white">
          Tell us who you are
        </h2>
        <p className="mt-2 text-base text-white/60">
          Two quick fields to get started. You can add a profile picture, city,
          and more later from your profile.
        </p>

        <div className="mt-6">
          <OnboardingForm
            playerId={player.id}
            initialDisplayName={player.display_name}
            initialDupr={player.dupr_self_rating}
          />
        </div>
      </div>
    </main>
  );
}
