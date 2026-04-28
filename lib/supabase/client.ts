"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser-side Supabase client. Use in client components.
 * Cookies are automatically read/written via the browser.
 *
 * Why the no-op lock:
 *   supabase-js uses `navigator.locks` to coordinate auth refreshes across
 *   tabs. In some browser contexts (Chrome bugs, blocked storage, crashed
 *   prior tabs holding the lock, certain extensions) the lock never releases
 *   and every auth-dependent call hangs forever. We don't have any tabs that
 *   need cross-tab sync for auth, so we disable the lock entirely — fn just
 *   runs without acquiring anything.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    },
  );
}
