import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Auth callback — handles every URL shape Supabase can send us:
 *
 *   1) ?token_hash=...&type=magiclink|email     (modern OTP flow)
 *   2) ?code=AUTH_CODE                           (PKCE / OAuth code flow)
 *   3) ?error=...&error_description=...          (Supabase verification error)
 *
 * Cookies are set on the same NextResponse we return so they survive the
 * redirect to the destination page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextPath = searchParams.get("next") ?? "/";
  const errorParam = searchParams.get("error");

  if (errorParam) {
    const desc = searchParams.get("error_description") || errorParam;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(desc)}`,
    );
  }

  // Pre-build the success redirect; supabase will attach session cookies to it
  // via the setAll callback during verifyOtp / exchangeCodeForSession.
  const response = NextResponse.redirect(`${origin}${nextPath}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let authError: { message: string } | null = null;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    authError = error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else {
    authError = { message: "missing_auth_params" };
  }

  if (authError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(authError.message)}`,
    );
  }

  return response;
}
