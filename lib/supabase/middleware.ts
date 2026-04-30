import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

/**
 * Refreshes the auth session cookie on every request.
 * Called from /middleware.ts (root) — do not import elsewhere.
 *
 * Why: Supabase access tokens expire in 1 hour; the refresh token is used
 * server-side to mint a new one. Without this, users would silently get
 * logged out after an hour of activity.
 */
export async function updateSession(request: NextRequest) {
  // If a magic-link URL lands on any page other than /auth/callback with
  // token_hash + type query params, forward it to /auth/callback so it
  // can be processed. This works around Supabase's email template rendering
  // ignoring the path we configure in the template.
  const url = new URL(request.url);
  const hasOtpParams =
    url.searchParams.get("token_hash") && url.searchParams.get("type");
  if (hasOtpParams && url.pathname !== "/auth/callback") {
    const callbackUrl = new URL("/auth/callback", url);
    callbackUrl.search = url.search;
    return NextResponse.redirect(callbackUrl);
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
      // Long-lived cookies so the session survives iOS Safari's
      // aggressive cleanup heuristics. 1 year matches the browser client.
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );

  // Important: this triggers a token refresh if needed.
  await supabase.auth.getUser();

  return response;
}
