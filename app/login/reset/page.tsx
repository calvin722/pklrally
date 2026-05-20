"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Wordmark from "@/components/Wordmark";

function ResetForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("email");
    if (fromUrl && !email) setEmail(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        // After clicking the email link, land on the set-password page
        // (the recovery session will be active by then).
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          "/login/set-password",
        )}`,
      },
    );

    if (resetErr) {
      setError(resetErr.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-black p-4 grid-bg">
      <div className="w-full max-w-md rounded-2xl border-2 border-pickle bg-black p-8 neon-pickle">
        <Link href="/" className="block">
          <Wordmark size="lg" priority />
          <span className="sr-only">PKLRALLY</span>
        </Link>
        <p className="mt-1 text-sm text-white/60">Play, Track &amp; Win</p>

        <h1 className="mt-6 font-display text-display-xl font-extrabold text-bright">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-white/70">
          Enter the email on your account. We&rsquo;ll send a link to set a new
          password.
        </p>

        {status === "sent" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border-2 border-pickle p-5">
              <p className="font-display text-display-base font-extrabold text-pickle">
                ✓ Check your email
              </p>
              <p className="mt-2 text-base text-white/80">
                We sent a password-reset link to{" "}
                <span className="text-bright">{email}</span>. Tap the link to
                set a new password.
              </p>
              <p className="mt-3 text-xs text-white/50">
                If you don&rsquo;t see it within a minute, check spam.
              </p>
            </div>
            <Link
              href="/login"
              className="block font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
            >
              ◀ Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={status === "sending"}
                autoComplete="email"
                className="mt-2 block w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none disabled:opacity-60"
              />
            </label>

            {error && <p className="text-sm text-bright">⚠ {error}</p>}

            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="soft-stamp w-full rounded-xl bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Send reset link"}
            </button>

            <Link
              href="/login"
              className="block text-center font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
            >
              ◀ Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
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
      <ResetForm />
    </Suspense>
  );
}
