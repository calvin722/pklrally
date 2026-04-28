"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface PlayerLite {
  id: string;
  display_name: string;
  is_admin: boolean;
}

export default function AuthButton() {
  const [player, setPlayer] = useState<PlayerLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pendingVouches, setPendingVouches] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!mounted) return;

        if (!user) {
          setPlayer(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("players")
          .select("id, display_name, is_admin")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!mounted) return;
        if (error) console.error("AuthButton player query:", error);
        setPlayer(data ?? null);
        setLoading(false);

        if (data?.id) loadPendingVouches(data.id);
      } catch (err) {
        console.error("AuthButton load threw:", err);
        if (mounted) {
          setPlayer(null);
          setLoading(false);
        }
      }
    }

    async function loadPendingVouches(playerId: string) {
      try {
        const { count, error } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .or(
            [
              `server_team_p1.eq.${playerId}`,
              `server_team_p2.eq.${playerId}`,
              `receiver_team_p1.eq.${playerId}`,
              `receiver_team_p2.eq.${playerId}`,
            ].join(","),
          )
          .neq("logged_by", playerId);
        if (error) {
          console.error("loadPendingVouches:", error);
          return;
        }
        if (mounted) setPendingVouches(count ?? 0);
      } catch (err) {
        console.error("loadPendingVouches threw:", err);
      }
    }

    load();
    const { data: subscription } = supabase.auth.onAuthStateChange(load);
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/40">
        ...
      </span>
    );
  }

  if (!player) {
    return (
      <Link
        href="/login"
        className="rounded-lg border-2 border-white px-4 py-2 font-display text-display-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white hover:text-black"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border-2 border-pickle px-4 py-2 font-display text-display-xs font-semibold uppercase tracking-wide text-pickle transition hover:bg-pickle hover:text-black"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {player.display_name} ▾
        {pendingVouches > 0 && (
          <span
            className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-bright px-1.5 font-mono text-[11px] font-bold text-black"
            aria-label={`${pendingVouches} pending vouches`}
          >
            {pendingVouches}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border-2 border-pickle bg-black neon-pickle"
          onMouseLeave={() => setOpen(false)}
        >
          <Link
            href={`/profile/${player.id}`}
            className="block px-4 py-3 text-base text-white transition hover:bg-pickle hover:text-black"
            onClick={() => setOpen(false)}
          >
            My Profile
          </Link>
          <Link
            href="/vouch"
            className="flex items-center justify-between border-t-2 border-pickle/40 px-4 py-3 text-base text-white transition hover:bg-pickle hover:text-black"
            onClick={() => setOpen(false)}
          >
            <span>Vouch inbox</span>
            {pendingVouches > 0 && (
              <span className="rounded-full bg-bright px-2 py-0.5 font-mono text-xs font-bold text-black">
                {pendingVouches}
              </span>
            )}
          </Link>
          {player.is_admin && (
            <Link
              href="/admin"
              className="block border-t-2 border-pickle/40 px-4 py-3 text-base text-bright transition hover:bg-bright hover:text-black"
              onClick={() => setOpen(false)}
            >
              ⚙ Admin
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="block w-full border-t-2 border-pickle/40 px-4 py-3 text-left text-base text-white transition hover:bg-bright hover:text-black"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
