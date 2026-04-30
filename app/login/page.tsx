"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Wordmark from "@/components/Wordmark";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;

    setStatus("sending");
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
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
        <p className="mt-1 text-sm text-white/60">
          the live pulse of pickleball
        </p>

        {status !== "sent" ? (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
                className="
                  mt-2 block w-full rounded-lg
                  border-2 border-white bg-black
                  px-4 py-3
                  text-base text-white placeholder:text-white/40
                  focus:border-pickle focus:outline-none
                  disabled:opacity-60
                "
              />
            </label>

            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="
                soft-stamp w-full rounded-xl
                bg-pickle px-6 py-4
                font-display text-display-base font-extrabold uppercase tracking-wide text-black
                disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>

            {status === "error" && errorMsg && (
              <p className="text-base text-bright">⚠ {errorMsg}</p>
            )}

            <p className="text-sm text-white/50">
              No password. We'll email you a one-tap login link.
            </p>
          </form>
        ) : (
          <div className="mt-8 space-y-4">
            <div className="rounded-xl border-2 border-pickle p-5">
              <p className="font-display text-display-base font-extrabold text-pickle">
                ✓ Check your email
              </p>
              <p className="mt-2 text-base text-white/80">
                Magic link sent to <span className="text-bright">{email}</span>.
                Tap the link to sign in. (Check spam if it doesn't show up.)
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
            >
              ◀ Use a different email
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
