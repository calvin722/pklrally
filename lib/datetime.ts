/**
 * Timezone-aware date/time formatting helpers used by match cards and
 * other timestamp surfaces.
 *
 * Matches happen at a real court, so the played_at timestamp should be
 * shown in the COURT's timezone, not the viewer's. Otherwise a match
 * played in Las Cruces at 6pm shows as 5pm to a viewer in California.
 *
 * The court table has a `timezone` column populated by migration 0023
 * (e.g. 'America/Denver', 'America/Phoenix', 'America/New_York').
 * We default to America/Denver if a court has no timezone set yet.
 */

export const DEFAULT_TZ = "America/Denver";

/**
 * Format an ISO timestamp at the given IANA timezone, e.g.
 *   formatAtTz("2026-04-30T23:30:00Z", "America/Phoenix")
 *   → "Apr 30, 4:30 PM MST"
 */
export function formatAtTz(
  iso: string,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
): string {
  const tz = timezone || DEFAULT_TZ;
  try {
    return new Date(iso).toLocaleString("en-US", {
      ...options,
      timeZone: tz,
    });
  } catch {
    // Invalid timezone — fall back to the default
    return new Date(iso).toLocaleString("en-US", {
      ...options,
      timeZone: DEFAULT_TZ,
    });
  }
}

/** Date-only formatter at zone, e.g. "Apr 30, 2026". */
export function formatDateAtTz(
  iso: string,
  timezone: string | null | undefined,
): string {
  return formatAtTz(iso, timezone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
