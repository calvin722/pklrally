import { createClient } from "./server";
import type { Database } from "./types";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

/**
 * Returns the players row for the currently authenticated user, or null
 * if the user is not signed in (or has no player row yet — shouldn't happen
 * because of the auto-create trigger, but we guard anyway).
 *
 * Server Components / Server Actions only.
 */
export async function getCurrentPlayer(): Promise<PlayerRow | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return player ?? null;
}
