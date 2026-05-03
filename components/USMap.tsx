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
import { useTheme } from "@/components/ThemeProvider";
import { stateCode, stateName, STATE_VIEWS } from "@/lib/states";

const US_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";

interface USMapProps {
  onCitySelect?: (city: CityNode) => void;
}

export default function USMap({ onCitySelect }: USMapProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [rawCities, setRawCities] = useState<CityNode[]>([]);
  const [legendExpanded, setLegendExpanded] = useState(true);
  // Selected state for in-page zoom — null = full US view
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const theme = useTheme();
  const isLight = theme === "light";

  const targetStateName = selectedState ? stateName(selectedState) : null;
  const view = selectedState
    ? STATE_VIEWS[selectedState] ?? { center: [-96, 38] as [number, number], zoom: 1 }
    : { center: [-96, 38] as [number, number], zoom: 1 };

  // Theme-aware map colors. CSS can't reach inline SVG attributes, so we
  // swap them here based on the current data-theme.
  const mapColors = isLight
    ? {
        canvasBg: "bg-[#FAFAF7] grid-bg",
        stateFill: "#FFFFFF",
        stateStroke: "#5C9900",
        stateHover: "#F0FCD3",
        publicDot: "#5C9900",
        privateDot: "#0072B5",
        dotStroke: "#FFFFFF",
        labelFill: "#18181b",
        labelStroke: "#FFFFFF",
      }
    : {
        canvasBg: "bg-black grid-bg",
        stateFill: "#000000",
        stateStroke: "#5C9900",
        stateHover: "#0a1a00",
        publicDot: "#99FF00",
        privateDot: "#00BFFF",
        dotStroke: "#000000",
        labelFill: "#FFFFFF",
        labelStroke: "#000000",
      };

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
    <div className={`relative h-full w-full overflow-hidden ${mapColors.canvasBg}`}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        width={800}
        height={500}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          center={view.center}
          zoom={view.zoom}
          minZoom={1}
          maxZoom={20}
        >
          <Geographies geography={US_TOPO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const isSelected =
                  targetStateName &&
                  geo.properties.name?.toLowerCase() ===
                    targetStateName.toLowerCase();
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={
                      isSelected
                        ? isLight
                          ? "#FFFFFF"
                          : "#0a0a0a"
                        : mapColors.stateFill
                    }
                    stroke={
                      isSelected
                        ? mapColors.stateStroke
                        : selectedState
                          ? isLight
                            ? "#D4D4D8"
                            : "rgba(92, 153, 0, 0.18)"
                          : mapColors.stateStroke
                    }
                    strokeWidth={isSelected ? 1 : 0.6}
                    onClick={() => {
                      const code = stateCode(geo.properties.name ?? "");
                      if (!code) return;
                      // Toggle: tapping the same state again zooms back out;
                      // tapping a different state switches to it.
                      setSelectedState((current) =>
                        current === code ? null : code,
                      );
                    }}
                    style={{
                      default: { outline: "none", cursor: "pointer" },
                      hover: {
                        outline: "none",
                        fill: mapColors.stateHover,
                        cursor: "pointer",
                      },
                      pressed: {
                        outline: "none",
                        fill: mapColors.stateHover,
                        cursor: "pointer",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {cities.map((city) => {
            const key = `${city.city}-${city.state}`;
            const isHovered = hoveredCity === key;

            // When zoomed into a state, hide cities that aren't in it.
            const inSelectedState =
              !selectedState ||
              city.state.toUpperCase() === selectedState;
            if (!inSelectedState) return null;

            // Scale dot + label down inversely with zoom so they stay at a
            // consistent screen size when zoomed into a state.
            const z = view.zoom;
            const baseR = Math.min(7, Math.max(4, 3 + city.recentMatches / 40));
            const r = baseR / z;
            const fontSize = 13 / z;
            const labelGap = 5 / z;
            const labelStrokeWidth = 3 / z;

            // Cities with at least one private court use the electric-blue
            // palette. Pure-public cities use the pickle-green palette.
            const isPrivate = city.hasPrivate;
            const buzzClass = city.buzzing
              ? isPrivate
                ? "buzz-electric"
                : "buzz-pickle"
              : "";
            const dotFill = isPrivate ? mapColors.privateDot : mapColors.publicDot;

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
                    stroke={mapColors.dotStroke}
                    strokeWidth={1 / z}
                  />
                </g>

                {/* Only show city labels when zoomed into a state, or on
                    hover. On the national map the dot alone is enough —
                    a buzzing city still pulses via buzzClass on <circle>. */}
                {(selectedState || isHovered) && (
                  <text
                    x={r + labelGap}
                    y={fontSize / 3}
                    textAnchor="start"
                    fill={mapColors.labelFill}
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontWeight: 700,
                      fontSize,
                      paintOrder: "stroke",
                      stroke: mapColors.labelStroke,
                      strokeWidth: labelStrokeWidth,
                      strokeLinejoin: "round",
                      pointerEvents: "none",
                      opacity: isHovered ? 1 : 0.85,
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

      {/* Zoomed-state header + back button */}
      {selectedState && (
        <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl border-2 border-pickle bg-black/85 px-3 py-2 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setSelectedState(null)}
            className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle hover:text-bright"
            aria-label="Back to US map"
          >
            ← All states
          </button>
          <span className="text-white/30">·</span>
          <span className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
            {targetStateName}
          </span>
        </div>
      )}

      {/* Legend — auto-collapses to a small badge after a few seconds */}
      {legendExpanded ? (
        <div className={`absolute left-3 top-1/2 -translate-y-1/2 rounded-xl border-2 border-pickle ${isLight ? "bg-white/90" : "bg-black/85"} p-4 backdrop-blur-sm`}>
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
            <span className="inline-block h-3 w-3 rounded-full bg-pickle" />
            <span>Public courts</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-white">
            <span className="inline-block h-3 w-3 rounded-full bg-electric" />
            <span>Private courts</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLegendExpanded(true)}
          className={`absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-pickle ${isLight ? "bg-white/90" : "bg-black/85"} backdrop-blur-sm hover:border-bright`}
          aria-label="Show legend"
        >
          <span className="buzz-pickle inline-block h-3 w-3 rounded-full bg-pickle" />
        </button>
      )}
    </div>
  );
}
