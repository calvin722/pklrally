import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Server-side Supabase client for Server Components, Server Actions,
 * and Route Handlers. Reads cookies via Next.js's cookies() helper.
 *
 * Note: this awaits cookies() because Next.js 15 made it async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can't set cookies — middleware does that.
            // Safe to swallow this error during SSR rendering.
          }
        },
      },
      // Match the browser-client cookie config so refreshes don't accidentally
      // shorten the cookie lifespan.
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}

/**
 * Privileged server-side client using the service_role key.
 * Bypasses RLS — use ONLY in admin routes / cron jobs / trusted server code.
 * Never import this from a client component.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
