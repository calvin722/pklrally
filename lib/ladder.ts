/**
 * Ladder + city-slug helpers.
 *
 * URL shape: /ladder/<state-lower>/<city-slug>
 *   e.g. "Las Cruces", "NM" -> /ladder/nm/las-cruces
 *        "Phoenix",   "AZ" -> /ladder/az/phoenix
 *
 * We intentionally keep the slug reversible without a lookup table — match
 * cities case-insensitively in the DB and replace dashes with spaces.
 */

export function citySlug(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function unslugCity(slug: string): string {
  // Replace dashes with spaces. Capitalization is matched case-insensitively
  // server-side so we don't need to title-case here for queries — but we do
  // for display.
  return slug.replace(/-/g, " ");
}

export function titleCase(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Current month key in 'YYYY-MM' format. Done in the user's local time so
 * "this month" means what they expect — a server-side "UTC" month would be
 * confusing in mountain/pacific evenings.
 *
 * For DB lookups we still pass the same string and the function compares
 * timestamps within UTC bounds; close enough for monthly-grain ranking.
 */
export function currentMonthKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export interface LadderRow {
  player_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  matches_played: number;
  wins: number;
  losses: number;
  weighted_wins: number; // sum of match_value for each win (0.5..1.5 per win)
  win_rate: number; // 0..1
  score: number;
  rank: number;
}
