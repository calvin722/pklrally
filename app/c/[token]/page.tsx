import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Short claim-link route used by click-to-text SMS invites.
 *
 *   pklrally.com/c/<token>
 *
 * Resolves the token to a guest player, validates it's still claimable,
 * then forwards to /login with the token in the query so the auth flow
 * can attach the guest history after sign-in.
 *
 * If the token is invalid or already claimed, we still send them to the
 * login page (without a token) so they can sign up the normal way —
 * better than a dead-end 404 for someone arriving from a friend's text.
 */
export default async function ClaimRedirectPage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: player } = await supabase
    .from("players")
    .select("id, display_name, invite_token, invite_token_expires_at, claimed_at")
    .eq("invite_token", token)
    .maybeSingle();

  // Token doesn't match anything claimable — send to plain login
  if (
    !player ||
    player.claimed_at ||
    (player.invite_token_expires_at &&
      new Date(player.invite_token_expires_at) < new Date())
  ) {
    redirect("/login");
  }

  // Hand off to login with the token so the auth callback can attach
  // the guest record once the user signs in via magic link.
  redirect(`/login?claim_token=${encodeURIComponent(token)}`);
}
