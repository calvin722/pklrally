"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Auth callback — runs entirely on the client so we can read the URL hash.
 *
 * Handles four URL shapes Supabase may send us:
 *   1) ?code=AUTH_CODE                    (PKCE / OAuth code)
 *   2) ?token_hash=...&type=magiclink     (modern OTP via custom email template)
 *   3) #access_token=...&refresh_token=...  (legacy implicit flow / admin-API links)
 *   4) ?error=...                         (Supabase rejected the verify request)
 *
 * The /auth/callback route was previously a server-only route handler, which
 * couldn't see the hash fragment in case 3. Hash fragments live only in the
 * browser, so this page must be a client component to read them.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function run() {
      const search = new URLSearchParams(window.location.search);
      const hashRaw = window.location.hash.slice(1); // drop the leading '#'
      const hash = new URLSearchParams(hashRaw);

      // Default redirect target after successful auth is /welcome, which itself
      // bounces to / for users who've already completed onboarding.
      const next = search.get("next") || hash.get("next") || "/welcome";

      // 4) Error from Supabase (in either query or hash)
      const errParam =
        search.get("error") ||
        hash.get("error") ||
        hash.get("error_code") ||
        null;
      if (errParam) {
        const desc =
          search.get("error_description") ||
          hash.get("error_description") ||
          errParam;
        return fail(desc);
      }

      // 1) PKCE code
      const code = search.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return fail(error.message);
        return win(next);
      }

      // 2) token_hash + type (modern OTP)
      const tokenHash = search.get("token_hash") || hash.get("token_hash");
      const type = (search.get("type") || hash.get("type")) as
        | EmailOtpType
        | null;
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        });
        if (error) return fail(error.message);
        return win(next);
      }

      // 3) Implicit flow tokens in the hash fragment
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) return fail(error.message);
        return win(next);
      }

      // No recognizable params anywhere
      return fail("missing_auth_params");
    }

    async function win(next: string) {
      if (cancelled) return;

      // Run post-sign-in housekeeping:
      //   - Auto-restore "take a break" accounts
      //   - Detect a fresh guest claim (claimed_at within 5 min)
      //   - Count pending vouches
      try {
        const { data: checkRows } = await supabase.rpc("post_sign_in_check");
        const check = Array.isArray(checkRows) ? checkRows[0] : checkRows;
        const wasJustClaimed = check?.was_just_claimed === true;
        const pendingVouches = Number(check?.pending_vouches ?? 0);

        // Fire the welcome-vouch email once on first claim
        if (wasJustClaimed && pendingVouches > 0) {
          // Don't await — fire and forget, no need to block redirect
          fetch("/api/welcome-vouch", { method: "POST" }).catch(() => {});
        }

        // Route to /vouch if there are pending matches AND we just claimed,
        // so the new user lands directly on their inbox.
        if (wasJustClaimed && pendingVouches > 0) {
          router.replace("/vouch?welcome=1");
          router.refresh();
          return;
        }
      } catch (e) {
        // Non-fatal — fall through to default routing
        console.warn("post_sign_in_check failed:", e);
      }

      // Clear the hash from the URL before navigating
      router.replace(next);
      router.refresh();
    }

    function fail(msg: string) {
      if (cancelled) return;
      setStatus("error");
      setErrorMsg(msg);
      // After a brief beat, bounce to /login with the error visible
      setTimeout(() => {
        if (!cancelled) {
          router.replace(`/login?error=${encodeURIComponent(msg)}`);
        }
      }, 1200);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-black p-4">
      <div className="text-center">
        {status === "working" ? (
          <>
            <p className="font-display text-display-lg font-extrabold uppercase tracking-wide text-pickle animate-flicker">
              Signing you in...
            </p>
            <p className="mt-3 text-sm text-white/40">
              Hold tight, this should only take a moment.
            </p>
          </>
        ) : (
          <p className="font-display text-display-base font-bold uppercase tracking-wide text-bright">
            ⚠ {errorMsg ?? "Something went wrong"}
          </p>
        )}
      </div>
    </main>
  );
}
