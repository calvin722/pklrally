"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { useRouter } from "next/navigation";
import { fetchCityNodes, isCityBuzzing } from "@/lib/courts";
import type { CityNode } from "@/lib/types";
import { stateName, STATE_VIEWS } from "@/lib/states";
import { citySlug } from "@/lib/ladder";
import { useTheme } from "@/components/ThemeProvider";

const US_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";

interface StateMapProps {
  stateCode: string; // uppercase e.g. "NM"
}

/**
 * Stylized state-level map. Same visual language as the homepage USMap
 * (neon outline + buzzing dots) but zoomed into a single state. Cities
 * are clickable and route to /map/[state]/[city] — the city Mapbox view.
 */
export default function StateMap({ stateCode }: StateMapProps) {
  const router = useRouter();
  const theme = useTheme();
  const isLight = theme === "light";
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [rawCities, setRawCities] = useState<CityNode[]>([]);

  const targetName = stateName(stateCode);
  const view = STATE_VIEWS[stateCode] ?? { center: [-96, 38], zoom: 1 };

  useEffect(() => {
    let alive = true;
    fetchCityNodes().then((all) => {
      if (alive) {
        setRawCities(
          all.filter((c) => c.state.toUpperCase() === stateCode),
        );
      }
    });
    const interval = setInterval(() => {
      fetchCityNodes().then((all) => {
        if (alive) {
          setRawCities(
            all.filter((c) => c.state.toUpperCase() === stateCode),
          );
        }
      });
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [stateCode]);

  const cities = useMemo(
    () => rawCities.map((c) => ({ ...c, buzzing: isCityBuzzing(c) })),
    [rawCities],
  );

  // Theme-aware colors (mirrors USMap)
  const colors = isLight
    ? {
        canvasBg: "bg-[#FAFAF7] grid-bg",
        stateFillSelected: "#FFFFFF",
        stateFillOther: "#F4F4F5",
        stateStroke: "#5C9900",
        stateStrokeOther: "#D4D4D8",
        publicDot: "#5C9900",
        privateDot: "#0072B5",
        dotStroke: "#FFFFFF",
        labelFill: "#18181b",
        labelStroke: "#FFFFFF",
      }
    : {
        canvasBg: "bg-black grid-bg",
        stateFillSelected: "#0a0a0a",
        stateFillOther: "#000000",
        stateStroke: "#5C9900",
        stateStrokeOther: "rgba(92, 153, 0, 0.18)",
        publicDot: "#99FF00",
        privateDot: "#00BFFF",
        dotStroke: "#000000",
        labelFill: "#FFFFFF",
        labelStroke: "#000000",
      };

  return (
    <div className={`relative h-full w-full overflow-hidden ${colors.canvasBg}`}>
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
                  geo.properties.name?.toLowerCase() ===
                  targetName?.toLowerCase();
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={
                      isSelected
                        ? colors.stateFillSelected
                        : colors.stateFillOther
                    }
                    stroke={
                      isSelected
                        ? colors.stateStroke
                        : colors.stateStrokeOther
                    }
                    strokeWidth={isSelected ? 1 : 0.4}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {cities.map((city) => {
            const key = `${city.city}-${city.state}`;
            const isHovered = hoveredCity === key;
            const r = Math.min(
              7,
              Math.max(4, 3 + city.recentMatches / 40),
            );
            const isPrivate = city.hasPrivate;
            const buzzClass = city.buzzing
              ? isPrivate
                ? "buzz-electric"
                : "buzz-pickle"
              : "";
            const dotFill = isPrivate ? colors.privateDot : colors.publicDot;

            return (
              <Marker
                key={key}
                coordinates={city.coordinates}
                onMouseEnter={() => setHoveredCity(key)}
                onMouseLeave={() => setHoveredCity(null)}
                onClick={() =>
                  router.push(
                    `/map/${stateCode.toLowerCase()}/${citySlug(city.city)}`,
                  )
                }
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
                  <circle
                    r={r}
                    fill={dotFill}
                    stroke={colors.dotStroke}
                    strokeWidth={1}
                  />
                </g>
                <text
                  x={r + 5}
                  y={4}
                  textAnchor="start"
                  fill={colors.labelFill}
                  style={{
                    fontFamily:
                      "var(--font-display), system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: 11,
                    paintOrder: "stroke",
                    stroke: colors.labelStroke,
                    strokeWidth: 3,
                    strokeLinejoin: "round",
                    pointerEvents: "none",
                    opacity: city.buzzing || isHovered ? 1 : 0.85,
                  }}
                >
                  {city.city}
                </text>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
