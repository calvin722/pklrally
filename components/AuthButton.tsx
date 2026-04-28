"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "./Avatar";

interface PlayerLite {
  id: string;
  display_name: string;
  is_admin: boolean;
  avatar_url: string | null;
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
          .select("id, display_name, is_admin, avatar_url")
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
      {/* Hamburger trigger — small avatar + 3-line icon, with badge */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-full border-2 border-pickle bg-black p-1.5 pr-3 transition hover:bg-pickle/10"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open menu"
      >
        <Avatar player={player} size="sm" />
        <svg
          width="18"
          height="14"
          viewBox="0 0 18 14"
          fill="none"
          aria-hidden
        >
          <rect width="18" height="2" rx="1" fill="#99FF00" />
          <rect y="6" width="18" height="2" rx="1" fill="#99FF00" />
          <rect y="12" width="18" height="2" rx="1" fill="#99FF00" />
        </svg>
        {pendingVouches > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-bright px-1.5 font-mono text-[11px] font-bold text-black"
            aria-label={`${pendingVouches} pending vouches`}
          >
            {pendingVouches}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border-2 border-pickle bg-black neon-pickle"
          onMouseLeave={() => setOpen(false)}
        >
          {/* Header — name, view profile shortcut */}
          <div className="flex items-center gap-3 border-b-2 border-pickle/40 bg-pickle/5 px-4 py-3">
            <Avatar player={player} size="md" />
            <div className="min-w-0">
              <div className="truncate font-display text-display-base font-extrabold text-white">
                {player.display_name}
              </div>
              <Link
                href={`/profile/${player.id}`}
                onClick={() => setOpen(false)}
                className="text-xs text-pickle hover:underline"
              >
                View profile
              </Link>
            </div>
          </div>

          <MenuItem
            href={`/profile/${player.id}`}
            icon="👤"
            label="My Profile"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            href="/vouch"
            icon="✓"
            label="Vouch Inbox"
            badge={pendingVouches > 0 ? pendingVouches : undefined}
            onClick={() => setOpen(false)}
          />
          <MenuItem
            href="/rally/new"
            icon="▶"
            label="Log a Rally"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            href="/stats"
            icon="📊"
            label="My Stats"
            comingSoon
          />
          <MenuItem
            href="/ladder"
            icon="🏆"
            label="Monthly Ladder"
            comingSoon
          />
          <MenuItem
            href="/courts/suggest"
            icon="📍"
            label="Suggest a Court"
            comingSoon
          />
          {player.is_admin && (
            <MenuItem
              href="/admin"
              icon="⚙"
              label="Admin"
              accent="bright"
              onClick={() => setOpen(false)}
            />
          )}

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 border-t-2 border-pickle/40 px-4 py-3 text-left text-base text-white transition hover:bg-bright hover:text-black"
            >
              <span aria-hidden>↩</span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  comingSoon?: boolean;
  accent?: "pickle" | "bright";
  onClick?: () => void;
}

function MenuItem({
  href,
  icon,
  label,
  badge,
  comingSoon,
  accent,
  onClick,
}: MenuItemProps) {
  const accentClass =
    accent === "bright"
      ? "text-bright hover:bg-bright hover:text-black"
      : "text-white hover:bg-pickle hover:text-black";

  if (comingSoon) {
    return (
      <div
        className="flex cursor-not-allowed items-center justify-between border-t-2 border-pickle/40 px-4 py-3 text-base text-white/40"
        title="Coming soon"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden className="opacity-60">
            {icon}
          </span>
          <span>{label}</span>
        </span>
        <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
          soon
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center justify-between border-t-2 border-pickle/40 px-4 py-3 text-base transition ${accentClass}`}
    >
      <span className="flex items-center gap-3">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </span>
      {typeof badge === "number" && (
        <span className="rounded-full bg-bright px-2 py-0.5 font-mono text-xs font-bold text-black">
          {badge}
        </span>
      )}
    </Link>
  );
}
