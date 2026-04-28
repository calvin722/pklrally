"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser-side Supabase client. Use in client components.
 * Cookies are automatically read/written via the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
