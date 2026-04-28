"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { fetchCityNodes, isCityBuzzing } from "@/lib/courts";
import type { CityNode } from "@/lib/types";

const US_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";

interface USMapProps {
  onCitySelect?: (city: CityNode) => void;
}

export default function USMap({ onCitySelect }: USMapProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [rawCities, setRawCities] = useState<CityNode[]>([]);
  const [legendExpanded, setLegendExpanded] = useState(true);

  // Fetch live courts from Supabase on mount + every 30 seconds.
  useEffect(() => {
    let alive = true;
    async function load() {
      const data = await fetchCityNodes();
      if (alive) setRawCities(data);
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-collapse the legend after 4 seconds so it doesn't block the map on mobile
  useEffect(() => {
    const timer = setTimeout(() => setLegendExpanded(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const cities = useMemo(
    () => rawCities.map((c) => ({ ...c, buzzing: isCityBuzzing(c) })),
    [rawCities],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-black grid-bg">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        width={800}
        height={500}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          center={[-96, 38]}
          zoom={1}
          minZoom={1}
          maxZoom={8}
          translateExtent={[
            [-200, -100],
            [1000, 600],
          ]}
        >
          <Geographies geography={US_TOPO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#000000"
                  stroke="#5C9900"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#0a1a00" },
                    pressed: { outline: "none", fill: "#0a1a00" },
                  }}
                />
              ))
            }
          </Geographies>

          {cities.map((city) => {
            const key = `${city.city}-${city.state}`;
            const isHovered = hoveredCity === key;
            const r = Math.min(7, Math.max(4, 3 + city.recentMatches / 40));

            // Cities with at least one private court use the electric-blue
            // palette. Pure-public cities use the pickle-green palette. Both
            // colors have buzzing variants for recent activity.
            const isPrivate = city.hasPrivate;
            const buzzClass = city.buzzing
              ? isPrivate
                ? "buzz-electric"
                : "buzz-pickle"
              : "";
            const dotFill = isPrivate ? "#00BFFF" : "#99FF00";

            return (
              <Marker
                key={key}
                coordinates={city.coordinates}
                onMouseEnter={() => setHoveredCity(key)}
                onMouseLeave={() => setHoveredCity(null)}
                onClick={() => onCitySelect?.(city)}
                style={{
                  default: { cursor: "pointer", outline: "none" },
                  hover: { cursor: "pointer", outline: "none" },
                  pressed: { cursor: "pointer", outline: "none" },
                }}
              >
                <g
                  className={buzzClass}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                >
                  {/* Smooth circle dot — green for public, blue for private */}
                  <circle
                    r={r}
                    fill={dotFill}
                    stroke="#000000"
                    strokeWidth={1}
                  />
                </g>

                {(city.buzzing || isHovered) && (
                  <text
                    x={r + 5}
                    y={4}
                    textAnchor="start"
                    fill="#FFFFFF"
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      paintOrder: "stroke",
                      stroke: "#000000",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {city.city}
                  </text>
                )}
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Legend — auto-collapses to a small badge after a few seconds */}
      {legendExpanded ? (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-xl border-2 border-pickle bg-black/85 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
              Live Pulse
            </span>
            <button
              type="button"
              onClick={() => setLegendExpanded(false)}
              className="ml-2 text-base leading-none text-white/50 hover:text-pickle"
              aria-label="Hide legend"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-white">
            <span className="buzz-pickle inline-block h-3 w-3 rounded-full bg-pickle" />
            <span>Public · active</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-white">
            <span className="inline-block h-3 w-3 rounded-full bg-pickle" />
            <span>Public · static</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-white">
            <span className="buzz-electric inline-block h-3 w-3 rounded-full bg-electric" />
            <span>Private · active</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-white">
            <span className="inline-block h-3 w-3 rounded-full bg-electric" />
            <span>Private · static</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLegendExpanded(true)}
          className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-pickle bg-black/85 backdrop-blur-sm hover:border-bright"
          aria-label="Show legend"
        >
          <span className="buzz-pickle inline-block h-3 w-3 rounded-full bg-pickle" />
        </button>
      )}
    </div>
  );
}
