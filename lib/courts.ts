import type { CityNode, Court } from "./types";
import { createClient as createBrowserClient } from "./supabase/client";

/**
 * Fetch every active city pulse from the `city_court_pulse` view, plus the
 * full court list for each city (so the side panel can render alphabetically
 * without a second roundtrip).
 *
 * Browser-side. Server Components should query Supabase directly.
 */
export async function fetchCityNodes(): Promise<CityNode[]> {
  const supabase = createBrowserClient();

  const [pulseRes, courtsRes] = await Promise.all([
    supabase
      .from("city_court_pulse")
      .select("city, state, latitude, longitude, recent_match_count, last_match_at"),
    supabase
      .from("courts")
      .select("id, name, city, state, latitude, longitude, type")
      .eq("status", "active"),
  ]);

  if (pulseRes.error) {
    console.error("city_court_pulse query failed:", pulseRes.error);
    return [];
  }
  if (courtsRes.error) {
    console.error("courts query failed:", courtsRes.error);
    return [];
  }

  // Bucket courts by "city, state"
  const byCity = new Map<string, Court[]>();
  for (const c of courtsRes.data ?? []) {
    const key = `${c.city}|${c.state}`;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key)!.push({
      id: c.id,
      name: c.name,
      city: c.city,
      state: c.state,
      coordinates: [Number(c.longitude), Number(c.latitude)],
      type: c.type,
    });
  }

  return (pulseRes.data ?? []).map((p) => ({
    city: p.city,
    state: p.state,
    coordinates: [Number(p.longitude), Number(p.latitude)] as [number, number],
    courts: byCity.get(`${p.city}|${p.state}`) ?? [],
    lastMatchAt: p.last_match_at,
    recentMatches: p.recent_match_count ?? 0,
  }));
}

/** True if the city has had a match in the last `windowMinutes` minutes. */
export function isCityBuzzing(
  city: CityNode,
  windowMinutes = 60,
): boolean {
  if (!city.lastMatchAt) return false;
  const elapsedMs = Date.now() - new Date(city.lastMatchAt).getTime();
  return elapsedMs <= windowMinutes * 60_000;
}
