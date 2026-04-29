"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ThemeProviderProps {
  initialTheme: "light" | "dark";
  playerId: string | null;
  children: React.ReactNode;
}

/**
 * Applies the user's theme to <html data-theme=""> and listens for
 * changes via a custom 'pklrally-theme-change' event so the settings
 * page can flip it without a route refresh.
 *
 * Persistence:
 *   - Authenticated users: players.theme column (cross-device)
 *   - Unauthenticated:    localStorage("pklrally-theme")
 *
 * Initial server-side rendering passes initialTheme so there's no
 * flash-of-wrong-theme on first paint.
 */
export default function ThemeProvider({
  initialTheme,
  playerId,
  children,
}: ThemeProviderProps) {
  // Apply the initial theme synchronously on mount, in case the html
  // attribute was not set during SSR (e.g. for non-account routes).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ theme: "light" | "dark" }>).detail;
      if (!detail?.theme) return;
      document.documentElement.setAttribute("data-theme", detail.theme);
      try {
        localStorage.setItem("pklrally-theme", detail.theme);
      } catch {
        /* ignore storage errors */
      }
      if (playerId) {
        const supabase = createClient();
        supabase
          .from("players")
          .update({ theme: detail.theme })
          .eq("id", playerId)
          .then(() => {});
      }
    }
    window.addEventListener("pklrally-theme-change", handler);
    return () => window.removeEventListener("pklrally-theme-change", handler);
  }, [playerId]);

  return <>{children}</>;
}

/**
 * Tiny helper used by any client component (Settings, hamburger) to
 * change the theme. Fires a custom event the provider listens on.
 */
export function setTheme(theme: "light" | "dark") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("pklrally-theme-change", { detail: { theme } }),
  );
}

/**
 * useTheme — reactive hook for components that need to swap inline
 * styles or SVG attributes based on the current theme. CSS overlays
 * handle most cases, but inline fills (e.g. SVG <Geography fill>) can't
 * be reached by CSS, so they read from this hook instead.
 */
export function useTheme(): "light" | "dark" {
  const [theme, setLocal] = useState<"light" | "dark">("dark");

  useEffect(() => {
    function read(): "light" | "dark" {
      if (typeof document === "undefined") return "dark";
      return document.documentElement.dataset.theme === "light" ? "light" : "dark";
    }
    setLocal(read());

    const observer = new MutationObserver(() => setLocal(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    function onCustomEvent(e: Event) {
      const detail = (e as CustomEvent<{ theme: "light" | "dark" }>).detail;
      if (detail?.theme) setLocal(detail.theme);
    }
    window.addEventListener("pklrally-theme-change", onCustomEvent);

    return () => {
      observer.disconnect();
      window.removeEventListener("pklrally-theme-change", onCustomEvent);
    };
  }, []);

  return theme;
}
