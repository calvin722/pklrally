"use client";

import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";

interface WordmarkProps {
  /** Visual size — controls rendered height (and width via aspect ratio). */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Override the priority hint — set true for above-the-fold logos */
  priority?: boolean;
}

/**
 * The PKLRALLY wordmark. Swaps between dark-mode and light-mode artwork
 * based on the active theme.
 *
 * Files (drop into /public):
 *   /wordmark-dark.svg   — used when [data-theme="dark"] is active
 *   /wordmark-light.svg  — used when [data-theme="light"] is active
 *
 * The aspect ratio is set to ~5.4:1 to match the supplied artwork. If
 * the source images have a different ratio, just adjust SIZE_MAP below
 * — the underlying Image component handles intrinsic dimensions.
 */
const SIZE_MAP = {
  xs: { h: 16, w: 86 },   // back links, footer chips
  sm: { h: 24, w: 130 },  // admin sidebar, default header
  md: { h: 32, w: 173 },  // settings page, page headers
  lg: { h: 44, w: 238 },  // login page, hero on auxiliary pages
  xl: { h: 56, w: 302 },  // homepage hero
};

export default function Wordmark({
  size = "sm",
  className = "",
  priority = false,
}: WordmarkProps) {
  const theme = useTheme();
  const src = theme === "light" ? "/wordmark-light.svg" : "/wordmark-dark.svg";
  const { h, w } = SIZE_MAP[size];

  return (
    <Image
      src={src}
      alt="PKLRALLY"
      width={w}
      height={h}
      priority={priority}
      className={`inline-block h-auto w-auto select-none ${className}`}
      style={{ height: h, width: "auto" }}
      draggable={false}
    />
  );
}
