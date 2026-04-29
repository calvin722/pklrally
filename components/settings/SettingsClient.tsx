"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setTheme } from "@/components/ThemeProvider";

interface Props {
  playerId: string;
  initialTheme: "light" | "dark";
}

export default function SettingsClient({ playerId, initialTheme }: Props) {
  const router = useRouter();
  const [theme, setLocalTheme] = useState<"light" | "dark">(initialTheme);

  function handleThemeChange(next: "light" | "dark") {
    setLocalTheme(next);
    setTheme(next); // Updates <html data-theme>, persists to DB + localStorage
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Appearance */}
      <Section title="Appearance">
        <p className="text-sm text-white/60">
          Switch between dark and light mode. Saved to your account so it
          follows you on every device.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <ThemeButton
            active={theme === "dark"}
            onClick={() => handleThemeChange("dark")}
            label="Dark"
            preview="bg-black border-white text-white"
          />
          <ThemeButton
            active={theme === "light"}
            onClick={() => handleThemeChange("light")}
            label="Light"
            preview="bg-white border-zinc-300 text-zinc-900"
          />
        </div>
      </Section>

      {/* Account — Take a break */}
      <Section title="Take a break">
        <p className="text-sm text-white/60">
          Hide your profile, stats, and ladder presence. Your match history
          stays intact, your account stays unlocked, and you can sign back in
          anytime to come back. Nothing is deleted.
        </p>
        <TakeBreakButton playerId={playerId} />
      </Section>

      {/* Account — Permanent delete */}
      <Section title="Delete account permanently" danger>
        <p className="text-sm text-white/60">
          This is irreversible. We&apos;ll wipe your name, email, avatar, and
          rating, and disconnect your sign-in. Your past matches stay on the
          ladder for the players you played with — but you&apos;ll show as
          &quot;Deleted Player&quot; and won&apos;t accrue stats or appear in
          rankings.
        </p>
        <DeleteAccountButton onComplete={() => router.push("/")} />
      </Section>
    </div>
  );
}

// =============================================================
// Sub-components
// =============================================================

function Section({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border-2 p-5 ${
        danger ? "border-bright/50 bg-bright/5" : "border-white/15 bg-white/[0.03]"
      }`}
    >
      <h2
        className={`font-display text-display-md font-extrabold uppercase tracking-tight ${
          danger ? "text-bright" : "text-pickle"
        }`}
      >
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  preview,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  preview: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition ${
        active
          ? "border-pickle bg-pickle/10"
          : "border-white/20 hover:border-pickle/50"
      }`}
    >
      <div
        className={`h-12 w-full rounded-md border-2 ${preview}`}
        aria-hidden
      />
      <span className="font-display text-display-sm font-bold uppercase tracking-wide text-white">
        {label}
      </span>
    </button>
  );
}

function TakeBreakButton({ playerId }: { playerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("soft_delete_account");
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    // Sign out + redirect home
    await fetch("/auth/signout", { method: "POST" });
    router.push("/?break=1");
    router.refresh();
  }

  return (
    <div className="mt-3">
      {!confirming ? (
        <button
          type="button"
          onClick={handleClick}
          className="rounded-lg border-2 border-white/30 px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-white/80 transition hover:border-pickle hover:text-pickle"
        >
          Take a break
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleClick}
            className="rounded-lg border-2 border-pickle bg-pickle px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-black disabled:opacity-50"
          >
            {busy ? "Pausing…" : "Yes, pause my account"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              setErr(null);
            }}
            className="rounded-lg border-2 border-white/30 px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-white/70"
          >
            Cancel
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-bright">⚠ {err}</p>}
      {/* playerId param exists for future RPC params; suppress unused */}
      <span className="hidden">{playerId}</span>
    </div>
  );
}

function DeleteAccountButton({ onComplete }: { onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "confirm" | "type">("idle");
  const [confirmation, setConfirmation] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_account_permanently");
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    // Sign out + redirect
    await fetch("/auth/signout", { method: "POST" });
    onComplete();
  }

  if (stage === "idle") {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setStage("confirm")}
          className="rounded-lg border-2 border-bright px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-bright transition hover:bg-bright hover:text-black"
        >
          Delete my account
        </button>
      </div>
    );
  }

  if (stage === "confirm") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-bright">
          ⚠ This cannot be undone. Type <strong>DELETE</strong> below to
          confirm.
        </p>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="w-full rounded-lg border-2 border-bright bg-black px-4 py-2 text-base text-white placeholder:text-white/30 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || confirmation !== "DELETE"}
            onClick={handleDelete}
            className="rounded-lg border-2 border-bright bg-bright px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-black disabled:opacity-30"
          >
            {busy ? "Deleting…" : "Delete forever"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStage("idle");
              setConfirmation("");
              setErr(null);
            }}
            className="rounded-lg border-2 border-white/30 px-4 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-white/70"
          >
            Cancel
          </button>
        </div>
        {err && <p className="text-sm text-bright">⚠ {err}</p>}
      </div>
    );
  }

  return null;
}
