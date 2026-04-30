/**
 * US state code <-> name lookups + topology helpers used by the drill-down map.
 * All 50 states + DC. We don't ship territories yet — pickleball-relevant scope
 * is the 50 states for now.
 */

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "NM" → "New Mexico". Returns null for invalid codes. */
export function stateName(code: string): string | null {
  return STATE_NAMES[code.toUpperCase()] ?? null;
}

/** "New Mexico" → "NM". Returns null if no match. */
export function stateCode(name: string): string | null {
  const target = name.trim().toLowerCase();
  for (const [code, n] of Object.entries(STATE_NAMES)) {
    if (n.toLowerCase() === target) return code;
  }
  return null;
}

/**
 * Approximate center [lon, lat] + zoom for each state, used by the
 * stylized state-zoom view. Numbers chosen by hand to fit the state
 * outline in the viewport with a bit of padding. Zoom is a multiplier
 * passed to react-simple-maps' ZoomableGroup — higher = tighter.
 */
export const STATE_VIEWS: Record<
  string,
  { center: [number, number]; zoom: number }
> = {
  AL: { center: [-86.8, 32.8], zoom: 7 },
  AK: { center: [-152, 64], zoom: 3 },
  AZ: { center: [-111.7, 34.3], zoom: 5.5 },
  AR: { center: [-92.4, 34.7], zoom: 6.5 },
  CA: { center: [-119.5, 37], zoom: 4 },
  CO: { center: [-105.5, 39], zoom: 6 },
  CT: { center: [-72.7, 41.6], zoom: 14 },
  DE: { center: [-75.5, 39], zoom: 16 },
  DC: { center: [-77.0, 38.9], zoom: 60 },
  FL: { center: [-82.5, 28], zoom: 5 },
  GA: { center: [-83.4, 32.7], zoom: 6.5 },
  HI: { center: [-157.5, 20.5], zoom: 6 },
  ID: { center: [-114.5, 45], zoom: 5 },
  IL: { center: [-89.2, 40.3], zoom: 6 },
  IN: { center: [-86.3, 39.9], zoom: 7 },
  IA: { center: [-93.5, 42], zoom: 6.5 },
  KS: { center: [-98.4, 38.5], zoom: 6 },
  KY: { center: [-85.3, 37.7], zoom: 6.5 },
  LA: { center: [-92, 31], zoom: 6.5 },
  ME: { center: [-69.2, 45.3], zoom: 6 },
  MD: { center: [-77, 39], zoom: 9 },
  MA: { center: [-71.7, 42.2], zoom: 9 },
  MI: { center: [-85, 44.5], zoom: 5 },
  MN: { center: [-94.5, 46.2], zoom: 5 },
  MS: { center: [-89.7, 32.8], zoom: 6.5 },
  MO: { center: [-92.3, 38.5], zoom: 6 },
  MT: { center: [-109.5, 47], zoom: 4.5 },
  NE: { center: [-99.5, 41.5], zoom: 6 },
  NV: { center: [-117, 39], zoom: 5 },
  NH: { center: [-71.5, 43.7], zoom: 9 },
  NJ: { center: [-74.5, 40.2], zoom: 10 },
  NM: { center: [-106, 34.3], zoom: 5.5 },
  NY: { center: [-75.5, 42.9], zoom: 5.5 },
  NC: { center: [-79.4, 35.6], zoom: 6 },
  ND: { center: [-100.5, 47.5], zoom: 6 },
  OH: { center: [-82.7, 40.3], zoom: 7 },
  OK: { center: [-97.5, 35.6], zoom: 6 },
  OR: { center: [-120.5, 44], zoom: 5 },
  PA: { center: [-77.5, 41], zoom: 6.5 },
  RI: { center: [-71.5, 41.7], zoom: 18 },
  SC: { center: [-81, 34], zoom: 7.5 },
  SD: { center: [-100, 44.4], zoom: 6 },
  TN: { center: [-86, 35.9], zoom: 6 },
  TX: { center: [-99, 31.5], zoom: 4 },
  UT: { center: [-111.7, 39.5], zoom: 6 },
  VT: { center: [-72.7, 44], zoom: 9 },
  VA: { center: [-78.5, 37.8], zoom: 6 },
  WA: { center: [-120.5, 47.5], zoom: 5.5 },
  WV: { center: [-80.5, 38.7], zoom: 7 },
  WI: { center: [-89.7, 44.5], zoom: 5.5 },
  WY: { center: [-107.5, 43], zoom: 5.5 },
};
