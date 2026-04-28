import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import SuggestCourtForm from "@/components/courts/SuggestCourtForm";

export const dynamic = "force-dynamic";

export default async function SuggestCourtPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/courts/suggest");

  return (
    <main className="min-h-svh bg-black p-4 grid-bg">
      <header className="mx-auto flex max-w-2xl items-center justify-between">
        <Link
          href="/"
          className="font-display text-display-lg font-extrabold leading-none text-pickle"
        >
          PKL<span className="text-bright">RALLY</span>
        </Link>
        <Link
          href="/"
          className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
        >
          ◀ Back
        </Link>
      </header>

      <div className="mx-auto mt-8 max-w-2xl">
        <h1 className="font-display text-display-2xl font-extrabold text-bright">
          Suggest a court
        </h1>
        <p className="mt-2 text-base text-white/60">
          Don't see your home court? Send it our way. Public courts get added
          within 24 hours after admin review.
        </p>

        <div className="mt-8">
          <SuggestCourtForm playerId={player.id} />
        </div>
      </div>
    </main>
  );
}
