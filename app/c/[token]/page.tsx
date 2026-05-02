import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}

/**
 * Short claim-link route used by click-to-text SMS invites and the
 * email block-invite for non-members.
 *
 *   pklrally.com/c/<token>             — generic claim
 *   pklrally.com/c/<token>?next=/play  — claim + land on a specific page
 *
 * Resolves the token to a guest player, then forwards to /login with
 * the token AND the next destination so the auth callback can take the
 * user straight to the block they were invited to (instead of /).
 *
 * If the token is invalid or already claimed, we still send them to the
 * login page so they can sign up the normal way — better than a dead-end
 * 404 for someone arriving from a friend's text.
 */
export default async function ClaimRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { token } = await params;
  const { next } = await searchParams;

  const supabase = await createClient();
  const { data: player } = await supabase
    .from("players")
    .select("id, display_name, invite_token, invite_token_expires_at, claimed_at")
    .eq("invite_token", token)
    .maybeSingle();

  const tokenInvalid =
    !player ||
    player.claimed_at ||
    (player.invite_token_expires_at &&
      new Date(player.invite_token_expires_at) < new Date());

  // Build the login URL — preserve `next` even if the token is bad so
  // the user still ends up at the right block after signing in.
  const params2 = new URLSearchParams();
  if (!tokenInvalid) params2.set("claim_token", token);
  if (next) params2.set("next", next);
  const qs = params2.toString();
  redirect(qs ? `/login?${qs}` : "/login");
}
