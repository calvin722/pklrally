import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";
import ProfileEditor from "@/components/ProfileEditor";
import PickleballRating from "@/components/PickleballRating";
import Avatar from "@/components/Avatar";
import AvatarUpload from "@/components/AvatarUpload";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !player) notFound();

  const me = await getCurrentPlayer();
  const isMe = me?.id === player.id;

  const winRate =
    player.matches_played > 0
      ? Math.round((player.wins / player.matches_played) * 100)
      : null;

  return (
    <main className="min-h-svh bg-black p-4 grid-bg">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
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
          ◀ Map
        </Link>
      </header>

      <div className="mx-auto mt-8 max-w-3xl space-y-5">
        {/* Identity card */}
        <section className="rounded-2xl border-2 border-pickle bg-black p-6 neon-pickle">
          <div className="flex items-start gap-5">
            <Avatar player={player} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="break-words font-display text-display-2xl font-extrabold text-bright">
                {player.display_name}
              </h1>
              {(player.city || player.state) && (
                <p className="mt-1 text-base text-white/70">
                  {[player.city, player.state].filter(Boolean).join(", ")}
                </p>
              )}
              {player.dupr_self_rating !== null && (
                <div className="mt-3">
                  <PickleballRating value={player.dupr_self_rating} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Lifetime stats */}
        <section className="rounded-2xl border-2 border-white/30 bg-black p-6">
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Lifetime stats
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Matches" value={player.matches_played} />
            <Stat label="Wins" value={player.wins} accent="pickle" />
            <Stat label="Losses" value={player.losses} accent="bright" />
            <Stat
              label="Win %"
              value={winRate !== null ? `${winRate}%` : "—"}
            />
          </div>
        </section>

        {/* Trophy room placeholder */}
        <section className="rounded-2xl border-2 border-white/30 bg-black p-6">
          <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
            Trophy room
          </h2>
          <p className="mt-3 text-base text-white/50">
            No trophies yet. Win a monthly court ladder to claim your first.
          </p>
        </section>

        {/* Edit form — own profile only */}
        {isMe && (
          <>
            <section className="rounded-2xl border-2 border-pickle bg-black p-6">
              <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
                Profile picture
              </h2>
              <div className="mt-4">
                <AvatarUpload
                  player={{
                    id: player.id,
                    display_name: player.display_name,
                    avatar_url: player.avatar_url,
                    avatar_focal_x: player.avatar_focal_x,
                    avatar_focal_y: player.avatar_focal_y,
                  }}
                />
              </div>
            </section>

            <section className="rounded-2xl border-2 border-bright bg-black p-6 neon-bright">
              <h2 className="font-display text-display-xs uppercase font-semibold tracking-wide text-bright">
                Edit profile
              </h2>
              <ProfileEditor
                playerId={player.id}
                initialUsername={player.username}
                initialFirstName={player.first_name}
                initialLastName={player.last_name}
                initialNamePublic={player.name_public}
                initialDupr={player.dupr_self_rating}
                initialCity={player.city}
                initialState={player.state}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "pickle" | "bright";
}) {
  const color =
    accent === "pickle"
      ? "text-pickle"
      : accent === "bright"
        ? "text-bright"
        : "text-white";
  return (
    <div className="rounded-xl border-2 border-white/20 p-4">
      <div className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60">
        {label}
      </div>
      <div className={`mt-2 font-mono text-display-xl font-bold ${color}`}>
        {value}
      </div>
    </div>
  );
}
