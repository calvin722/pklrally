"use client";

import { useEffect, useState } from "react";
import { fetchMatchesForCity, type MatchSummary } from "@/lib/matches";
import { createClient } from "@/lib/supabase/client";
import MatchCard from "./MatchCard";

interface CityTimelineProps {
  city: string;
  state: string;
}

export default function CityTimeline({ city, state }: CityTimelineProps) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const supabase = createClient();
      const [
        rows,
        {
          data: { user },
        },
      ] = await Promise.all([
        fetchMatchesForCity(city, state),
        supabase.auth.getUser(),
      ]);

      let playerId: string | null = null;
      if (user) {
        const { data } = await supabase
          .from("players")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        playerId = data?.id ?? null;
      }

      if (alive) {
        setMatches(rows);
        setViewerPlayerId(playerId);
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [city, state]);

  if (loading) {
    return (
      <p className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle animate-flicker">
        Loading recent matches...
      </p>
    );
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-white/40">
        No matches in {city} in the last 7 days.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          viewerPlayerId={viewerPlayerId}
          compact
        />
      ))}
    </div>
  );
}
