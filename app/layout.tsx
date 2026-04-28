import type { Metadata, Viewport } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "PKLRALLY — The Live Pulse of Pickleball",
  description:
    "Log rallies, track stats, and watch your city light up. The neon-arcade social map of pickleball.",
  applicationName: "PKLRALLY",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-black font-sans text-white antialiased">
        {children}
      </body>
    </html>
  );
}
