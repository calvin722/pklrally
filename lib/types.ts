/**
 * Shared types for RallyUp.
 * These will eventually map to Supabase table rows; for V1 scaffold they're
 * driven from mock data.
 */

export type CourtType = "public" | "private";

export interface Court {
  id: string;
  name: string;
  city: string;
  state: string;
  /** [longitude, latitude] — the order react-simple-maps / d3 expects. */
  coordinates: [number, number];
  type: CourtType;
}

export interface CityNode {
  city: string;
  state: string;
  /** [longitude, latitude] — city centroid, used for the map dot. */
  coordinates: [number, number];
  courts: Court[];
  /**
   * ISO timestamp of the most recent match logged at any court in this city.
   * If within the last 60 minutes, the dot buzzes.
   */
  lastMatchAt: string | null;
  /** Total match count last 30 days — drives dot size. */
  recentMatches: number;
}
