import type { Config } from "tailwindcss";

/**
 * PKLRALLY — Modern neon design system.
 *
 * Palette (4 high-contrast accents over a black canvas):
 *   - pickle:   #99FF00  (Pickleball Green — primary, glow color)
 *   - electric: #00BFFF  (Electric Blue — secondary, private courts)
 *   - bright:   #FFFF00  (Bright Yellow — accents, static dots, scores)
 *   - white:    #FFFFFF  (UI text, borders)
 *
 * Typography stack (loaded via next/font in app/layout.tsx):
 *   - sans:    Inter         — body
 *   - display: Manrope       — headings, labels, brand
 *   - mono:    JetBrains Mono — scores, stats, code
 *
 * Visual language:
 *   - 2px high-contrast borders (kept for the neon-edge feel)
 *   - Rounded corners (4–16px scale)
 *   - Soft "stamp" buttons with hard offset shadow (chunky but rounded)
 *   - Buzzing glow animations preserved on active courts
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: "#000000",
      white: "#FFFFFF",
      pickle: {
        DEFAULT: "#99FF00",
        dim: "#5C9900",
      },
      electric: {
        DEFAULT: "#00BFFF",
        dim: "#0072A0",
      },
      bright: {
        DEFAULT: "#FFFF00",
        dim: "#999900",
      },
    },
    fontFamily: {
      sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      display: ["var(--font-display)", "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "monospace"],
    },
    extend: {
      borderRadius: {
        none: "0",
        sm: "4px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        full: "9999px",
      },
      borderWidth: {
        "1": "1px",
        "2": "2px",
        "3": "3px",
        "4": "4px",
      },
      fontSize: {
        // Display sizes — Manrope, used for headings and labels.
        "display-xs": ["12px", { lineHeight: "16px", letterSpacing: "0.04em" }],
        "display-sm": ["14px", { lineHeight: "18px", letterSpacing: "0.02em" }],
        "display-base": ["18px", { lineHeight: "24px", letterSpacing: "0" }],
        "display-lg": ["24px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
        "display-xl": ["32px", { lineHeight: "38px", letterSpacing: "-0.02em" }],
        "display-2xl": [
          "44px",
          { lineHeight: "50px", letterSpacing: "-0.02em" },
        ],
      },
      animation: {
        buzz: "buzz 1.2s ease-in-out infinite",
        flicker: "flicker 4s steps(8, end) infinite",
        "pop-in": "pop-in 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        buzz: {
          "0%, 100%": {
            filter:
              "drop-shadow(0 0 3px #99FF00) drop-shadow(0 0 6px #99FF00)",
            transform: "scale(1)",
          },
          "50%": {
            filter:
              "drop-shadow(0 0 8px #99FF00) drop-shadow(0 0 16px #99FF00)",
            transform: "scale(1.18)",
          },
        },
        flicker: {
          "0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%": { opacity: "1" },
          "20%, 24%, 55%": { opacity: "0.85" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
