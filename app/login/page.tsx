"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Wordmark from "@/components/Wordmark";

type Mode = "signin" | "signup";
type Status = "idle" | "submitting" | "signedUp" | "error";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Pre-fill from URL (invite emails, claim links, error redirects)
  useEffect(() => {
    const fromUrl = searchParams.get("email");
    if (fromUrl && !email) setEmail(fromUrl);
    const errFromUrl = searchParams.get("error");
    if (errFromUrl) setError(errFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** Build the redirect URL Supabase Auth bounces back to after email
   *  confirmation, preserving any context params we got. */
  function buildRedirectUrl(): string {
    const next = searchParams.get("next");
    const claim = searchParams.get("claim");
    const claimToken = searchParams.get("claim_token");
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    if (claim) params.set("claim", claim);
    if (claimToken) params.set("claim_token", claimToken);
    const qs = params.toString();
    return qs
      ? `${window.location.origin}/auth/callback?${qs}`
      : `${window.location.origin}/auth/callback`;
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setStatus("submitting");
    setError(null);
    setInfo(null);

    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInErr) {
      // Surface a helpful message for the magic-link → password migration:
      // existing accounts have no password set, so signin fails. Point them
      // at the password-reset flow.
      const msg = signInErr.message?.toLowerCase() ?? "";
      if (msg.includes("invalid login credentials")) {
        setError(
          "Email or password is wrong. If you used to sign in with a magic link, click \"Forgot password\" below to set one.",
        );
      } else {
        setError(signInErr.message);
      }
      setStatus("error");
      return;
    }

    // Signed in — bounce to the next URL (or onboarding/home)
    const next = searchParams.get("next") || "/welcome";
    router.replace(next);
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setError(null);
    setInfo(null);

    const supabase = createClient();
    const claimToken = searchParams.get("claim_token");
    const { error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: buildRedirectUrl(),
        // Forward the claim_token so migration 0026's trigger can link
        // the new account to the existing guest player row in the same
        // transaction.
        data: claimToken ? { claim_token: claimToken } : undefined,
      },
    });

    if (signUpErr) {
      setError(signUpErr.message);
      setStatus("error");
      return;
    }
    setStatus("signedUp");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-black p-4 grid-bg">
      <div className="w-full max-w-md rounded-2xl border-2 border-pickle bg-black p-8 neon-pickle">
        <Link href="/" className="block">
          <Wordmark size="lg" priority />
          <span className="sr-only">PKLRALLY</span>
        </Link>
        <p className="mt-1 text-sm text-white/60">Play, Track &amp; Win</p>

        {/* Mode tabs */}
        {status !== "signedUp" && (
          <div className="mt-6 flex gap-1 rounded-lg border-2 border-white/20 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
                setStatus("idle");
              }}
              className={`flex-1 rounded-md px-3 py-2 font-display text-display-xs font-bold uppercase tracking-wide transition ${
                mode === "signin"
                  ? "bg-pickle text-black"
                  : "text-white/60 hover:text-pickle"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setInfo(null);
                setStatus("idle");
              }}
              className={`flex-1 rounded-md px-3 py-2 font-display text-display-xs font-bold uppercase tracking-wide transition ${
                mode === "signup"
                  ? "bg-pickle text-black"
                  : "text-white/60 hover:text-pickle"
              }`}
            >
              Create account
            </button>
          </div>
        )}

        {status === "signedUp" ? (
          <SignedUpConfirmation email={email} />
        ) : mode === "signin" ? (
          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={status === "submitting"}
                autoComplete="email"
                className={inputCls}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={status === "submitting"}
                autoComplete="current-password"
                className={inputCls}
              />
            </Field>

            {error && <p className="text-sm text-bright">⚠ {error}</p>}
            {info && <p className="text-sm text-pickle">{info}</p>}

            <button
              type="submit"
              disabled={status === "submitting" || !email || !password}
              className={primaryBtn}
            >
              {status === "submitting" ? "Signing in..." : "Sign in"}
            </button>

            <div className="flex justify-between text-xs">
              <Link
                href={`/login/reset${
                  email ? `?email=${encodeURIComponent(email)}` : ""
                }`}
                className="text-white/60 hover:text-pickle"
              >
                Forgot password?
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setStatus("idle");
                }}
                className="text-white/60 hover:text-pickle"
              >
                New here? Create account →
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="mt-6 space-y-4">
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={status === "submitting"}
                autoComplete="email"
                className={inputCls}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={status === "submitting"}
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={status === "submitting"}
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>

            {error && <p className="text-sm text-bright">⚠ {error}</p>}

            <button
              type="submit"
              disabled={
                status === "submitting" ||
                !email ||
                !password ||
                !confirmPassword
              }
              className={primaryBtn}
            >
              {status === "submitting" ? "Creating account..." : "Create account"}
            </button>

            <p className="text-xs text-white/50">
              After signing up you&rsquo;ll get a confirmation email. Tap the
              link to finish creating your account.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function SignedUpConfirmation({ email }: { email: string }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border-2 border-pickle p-5">
        <p className="font-display text-display-base font-extrabold text-pickle">
          ✓ Check your email
        </p>
        <p className="mt-2 text-base text-white/80">
          We sent a confirmation link to{" "}
          <span className="text-bright">{email}</span>. Click it to finish
          activating your account, then come back and sign in.
        </p>
        <p className="mt-3 text-xs text-white/50">
          Check spam if it doesn&rsquo;t arrive within a minute. On mobile, the
          link works best opened in your default browser.
        </p>
      </div>
      <Link
        href="/login"
        className="block font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
      >
        ◀ Back to sign in
      </Link>
    </div>
  );
}

// ---- shared styles ----
const inputCls =
  "mt-2 block w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none disabled:opacity-60";
const primaryBtn =
  "soft-stamp w-full rounded-xl bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center bg-black p-4">
          <p className="font-display text-display-sm uppercase font-semibold tracking-wide text-pickle animate-flicker">
            Loading…
          </p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
