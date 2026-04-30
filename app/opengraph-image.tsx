import { ImageResponse } from "next/og";

/**
 * Dynamically generated Open Graph card.
 *
 * Renders to /opengraph-image at 1200x630 — the size iMessage, Slack,
 * Twitter, Facebook, etc. expect for link previews. Uses Next's built-in
 * ImageResponse (Satori under the hood), so we don't have to ship a
 * static PNG.
 *
 * If we ever want a custom-designed PNG instead, drop it at
 * /public/og-image.png and update app/layout.tsx metadata.openGraph.images
 * to point at "/og-image.png" — the static file wins over this route.
 */
export const runtime = "edge";
export const alt = "PKLRALLY — Play, Track & Win";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Wordmark — recreated in JSX styling so we don't depend on font
            loading from disk. PKL = pickle green, RALLY = bright yellow,
            both italic-skew + drop shadow to match the brand. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontWeight: 900,
            fontSize: 200,
            letterSpacing: "-0.04em",
            transform: "skew(-8deg)",
            lineHeight: 1,
          }}
        >
          <span style={{ color: "#99FF00", textShadow: "4px 4px 0 #000" }}>
            PKL
          </span>
          <span style={{ color: "#FFFF00", textShadow: "4px 4px 0 #000" }}>
            RALLY
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 48,
            fontSize: 56,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.01em",
            textAlign: "center",
          }}
        >
          Play, Track & Win
        </div>

        {/* Subline */}
        <div
          style={{
            marginTop: 24,
            fontSize: 28,
            color: "rgba(255, 255, 255, 0.6)",
            textAlign: "center",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          The social map of pickleball
        </div>

        {/* Bottom accent strip */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            background:
              "linear-gradient(90deg, #99FF00 0%, #00BFFF 50%, #FFFF00 100%)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
