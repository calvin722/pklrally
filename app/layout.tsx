import type { Metadata, Viewport } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import { getCurrentPlayer } from "@/lib/supabase/getCurrentPlayer";

/**
 * Typography stack — modern, smooth, friendly.
 *   - Inter: body text, default everywhere
 *   - Manrope: display / headings / labels (geometric, friendly)
 *   - JetBrains Mono: numbers, scores, stats (subtle techy character)
 *
 * next/font self-hosts the WOFF2 files at build time — no FOUT, no
 * external font CDN, no layout shift.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500", "600", "700"],
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://pklrally.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "PKLRALLY — Play, Track & Win",
  description:
    "The social map of pickleball. Log your matches, track your stats, and compete for monthly trophies in your city.",
  applicationName: "PKLRALLY",
  openGraph: {
    title: "PKLRALLY — Play, Track & Win",
    description:
      "Log your matches, track your stats, and compete for monthly trophies in your city.",
    url: SITE_URL,
    siteName: "PKLRALLY",
    type: "website",
    // Image auto-wired from app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "PKLRALLY — Play, Track & Win",
    description:
      "Log your matches, track your stats, and compete for monthly trophies in your city.",
    // Image auto-wired from app/opengraph-image.tsx
  },
  icons: {
    icon: "/wordmark-dark.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side fetch of the player's theme so first paint is correct.
  // Falls back to "dark" if not signed in or if the column is missing.
  const player = await getCurrentPlayer().catch(() => null);
  const initialTheme: "light" | "dark" = player?.theme === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      data-theme={initialTheme}
      className={`${inter.variable} ${manrope.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-black font-sans text-white antialiased">
        {/* Umami analytics — privacy-friendly pageview + UTM tracking */}
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id="5d74cd25-942b-45c4-9eff-742d8a7efa33"
          strategy="afterInteractive"
        />
        <ThemeProvider initialTheme={initialTheme} playerId={player?.id ?? null}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
