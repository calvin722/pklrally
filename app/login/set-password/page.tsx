"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Wordmark from "@/components/Wordmark";

/**
 * "Set a new password" form — landed here from a password-reset email after
 * /auth/callback has already exchanged the recovery code for a session. So
 * the user is technically signed in for the duration of this page; we just
 * need them to set a password before they can use the account normally.
 */
export default function SetPasswordPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data?.user);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    setStatus("saving");
    setError(null);

    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setStatus("error");
      return;
    }
    setStatus("saved");
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
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
          Set your password
        </h1>

        {authed === false && (
          <div className="mt-4 rounded-lg border-2 border-bright bg-bright/5 px-4 py-3 text-sm text-bright">
            ⚠ Your reset link expired or is invalid. Request a new one from{" "}
            <Link href="/login/reset" className="underline">
              Forgot password
            </Link>
            .
          </div>
        )}

        {status === "saved" ? (
          <div className="mt-6 rounded-xl border-2 border-pickle p-5">
            <p className="font-display text-display-base font-extrabold text-pickle">
              ✓ Password set
            </p>
            <p className="mt-2 text-base text-white/80">
              You&rsquo;re signed in. Taking you home…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
                New password
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={status === "saving" || authed === false}
                autoComplete="new-password"
                className="mt-2 block w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
                Confirm password
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={status === "saving" || authed === false}
                autoComplete="new-password"
                className="mt-2 block w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none disabled:opacity-60"
              />
            </label>

            {error && <p className="text-sm text-bright">⚠ {error}</p>}

            <button
              type="submit"
              disabled={
                status === "saving" ||
                authed === false ||
                !password ||
                !confirmPassword
              }
              className="soft-stamp w-full rounded-xl bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "saving" ? "Saving..." : "Save password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
