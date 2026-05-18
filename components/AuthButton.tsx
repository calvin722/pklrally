"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import StartLeagueModal from "./leagues/StartLeagueModal";

interface PlayerLite {
  id: string;
  display_name: string;
  is_admin: boolean;
  avatar_url: string | null;
  avatar_focal_x: number;
  avatar_focal_y: number;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * AuthButton — uses ONLY direct REST calls + cookie reading.
 *
 * supabase-js's auth client has a known navigator.locks-based mutex that
 * hangs in certain browser/extension states even with the lock-disable
 * option. Rather than fight the library, we sidestep it: read the session
 * directly from the auth cookie, and use plain `fetch` with the access
 * token to hit /rest/v1/. Always responsive, no lock contention possible.
 */
export default function AuthButton() {
  const [player, setPlayer] = useState<PlayerLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [startLeagueOpen, setStartLeagueOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const session = readSessionFromCookie();
        if (!mounted) return;

        if (!session) {
          setPlayer(null);
          setLoading(false);
          return;
        }

        const playerRow = await fetchPlayer(
          session.userId,
          session.accessToken,
        );
        if (!mounted) return;
        setPlayer(playerRow);
        setLoading(false);
      } catch (err) {
        console.error("AuthButton load failed:", err);
        if (mounted) {
          setPlayer(null);
          setLoading(false);
        }
      }
    }

    load();
    // Re-check when the page regains focus (covers sign-out from another tab)
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibility);
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
        className="relative flex items-center gap-2 rounded-full border-2 border-pickle bg-black p-1.5 pr-3 transition hover:bg-pickle/10"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open menu"
      >
        <Avatar player={player} size="sm" />
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
          <rect width="18" height="2" rx="1" fill="#99FF00" />
          <rect y="6" width="18" height="2" rx="1" fill="#99FF00" />
          <rect y="12" width="18" height="2" rx="1" fill="#99FF00" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border-2 border-pickle bg-black neon-pickle"
          onMouseLeave={() => setOpen(false)}
        >
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

          <MenuItem href={`/profile/${player.id}`} icon="👤" label="My Profile" onClick={() => setOpen(false)} />
          <MenuItem href="/stats" icon="📊" label="My Stats" onClick={() => setOpen(false)} />
          <MenuItem
            action={() => {
              setOpen(false);
              setStartLeagueOpen(true);
            }}
            icon="👥"
            label="Start a Ladder League"
          />
          <MenuItem
            href="/leagues/manage"
            icon="🗂"
            label="Manage My Leagues"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            href="/leagues?status=finished"
            icon="📜"
            label="Past Leagues"
            onClick={() => setOpen(false)}
          />
          <MenuItem href="/courts/suggest" icon="📍" label="Suggest a Court" onClick={() => setOpen(false)} />
          <MenuItem href="/settings" icon="⚙" label="Settings" onClick={() => setOpen(false)} />
          {player.is_admin && (
            <MenuItem href="/admin" icon="🛡" label="Admin" accent="bright" onClick={() => setOpen(false)} />
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

      <StartLeagueModal
        open={startLeagueOpen}
        onClose={() => setStartLeagueOpen(false)}
      />
    </div>
  );
}

// =============================================================
// Direct cookie + REST helpers — no supabase-js dependency
// =============================================================

interface ParsedSession {
  userId: string;
  accessToken: string;
}

function readSessionFromCookie(): ParsedSession | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";").map((c) => c.trim());

  // Base auth-token cookie (no chunk suffix)
  const authBase = cookies.find(
    (c) => /^sb-[^=]+-auth-token=/.test(c) && !/-auth-token\.\d+=/.test(c),
  );
  // Chunked cookies: -auth-token.0, .1, .2, ...
  const authChunks = cookies
    .filter((c) => /^sb-[^=]+-auth-token\.\d+=/.test(c))
    .sort((a, b) => {
      const ai = parseInt(a.match(/-auth-token\.(\d+)=/)?.[1] ?? "0", 10);
      const bi = parseInt(b.match(/-auth-token\.(\d+)=/)?.[1] ?? "0", 10);
      return ai - bi;
    });

  let raw = "";
  if (authBase) raw = authBase.split("=").slice(1).join("=");
  else if (authChunks.length)
    raw = authChunks.map((c) => c.split("=").slice(1).join("=")).join("");
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const json = decoded.startsWith("base64-") ? atob(decoded.slice(7)) : decoded;
    const session = JSON.parse(json);
    if (!session?.access_token || !session?.user?.id) return null;
    return {
      userId: session.user.id,
      accessToken: session.access_token,
    };
  } catch {
    return null;
  }
}

async function fetchPlayer(
  userId: string,
  accessToken: string,
): Promise<PlayerLite | null> {
  const url = `${SUPABASE_URL}/rest/v1/players?select=id,display_name,is_admin,avatar_url,avatar_focal_x,avatar_focal_y&auth_user_id=eq.${userId}&limit=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// =============================================================
// Menu UI atoms
// =============================================================

interface MenuItemProps {
  /** Where to navigate. Omit if using `action` for non-nav items. */
  href?: string;
  /** Custom click handler. Renders the row as a <button> when provided. */
  action?: () => void;
  icon: string;
  label: string;
  badge?: number;
  comingSoon?: boolean;
  accent?: "pickle" | "bright";
  onClick?: () => void;
}

function MenuItem({
  href,
  action,
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

  const inner = (
    <>
      <span className="flex items-center gap-3">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </span>
      {typeof badge === "number" && (
        <span className="rounded-full bg-bright px-2 py-0.5 font-mono text-xs font-bold text-black">
          {badge}
        </span>
      )}
    </>
  );

  const className = `flex w-full items-center justify-between border-t-2 border-pickle/40 px-4 py-3 text-left text-base transition ${accentClass}`;

  if (action) {
    return (
      <button
        type="button"
        onClick={() => {
          onClick?.();
          action();
        }}
        className={className}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} onClick={onClick} className={className}>
      {inner}
    </Link>
  );
}
