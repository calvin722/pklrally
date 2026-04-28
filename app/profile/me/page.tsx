import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

/**
 * /profile/me — convenience redirect to the current user's profile page.
 * Bounces to /login if not signed in.
 */
export default async function MyProfileRedirect() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/profile/me");
  redirect(`/profile/${player.id}`);
}
