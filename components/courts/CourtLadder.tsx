"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";

interface LadderEntry {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_focal_x: number | null;
  avatar_focal_y: number | null;
  is_guest: boolean;
  wins: number;
}

interface CourtLadderProps {
  courtId: string;
}

/**
 * Top 3 monthly winners at a single court. Fetches this-month vouched
 * matches, computes per-player wins client-side, takes top 3.
 *
 * V1: one query per court — fine for our seeded count, would batch into a
 * single city-level query when we have hundreds of courts.
 */
export default function CourtLadder({ courtId }: CourtLadderProps) {
  const [ladder, setLadder] = useState<LadderEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const supabase = createClient();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: matches } = await supabase
        .from("matches")
        .select(
          "server_score, receiver_score, server_team_p1, server_team_p2, receiver_team_p1, receiver_team_p2",
        )
        .eq("court_id", courtId)
        .eq("status", "vouched")
        .gte("played_at", monthStart.toISOString());

      if (!matches || matches.length === 0) {
        if (alive) setLadder([]);
        return;
      }

      const winsByPlayer = new Map<string, number>();
      for (const m of matches) {
        const winners =
          m.server_score > m.receiver_score
            ? [m.server_team_p1, m.server_team_p2]
            : [m.receiver_team_p1, m.receiver_team_p2];
        for (const id of winners) {
          if (id) winsByPlayer.set(id, (winsByPlayer.get(id) ?? 0) + 1);
        }
      }

      const top3 = Array.from(winsByPlayer.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      if (top3.length === 0) {
        if (alive) setLadder([]);
        return;
      }

      const { data: players } = await supabase
        .from("players")
        .select(
          "id, display_name, avatar_url, avatar_focal_x, avatar_focal_y, is_guest",
        )
        .in(
          "id",
          top3.map(([id]) => id),
        );

      const byId = new Map((players ?? []).map((p) => [p.id, p] as const));
      const result: LadderEntry[] = top3
        .map(([id, wins]) => {
          const p = byId.get(id);
          if (!p) return null;
          return {
            id: p.id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            avatar_focal_x: p.avatar_focal_x,
            avatar_focal_y: p.avatar_focal_y,
            is_guest: p.is_guest,
            wins,
          };
        })
        .filter((e): e is LadderEntry => e !== null);

      if (alive) setLadder(result);
    }
    load();
    return () => {
      alive = false;
    };
  }, [courtId]);

  if (ladder === null) {
    return null; // Don't show anything during initial fetch — keeps layout calm
  }

  if (ladder.length === 0) {
    return (
      <div className="mt-3 text-xs text-white/40">
        No matches yet this month.
      </div>
    );
  }

  const placeColors = ["text-bright", "text-pickle", "text-white/70"];

  return (
    <div className="mt-3">
      <div className="font-display text-[10px] uppercase font-bold tracking-widest text-pickle">
        Top this month
      </div>
      <div className="mt-2 space-y-1.5">
        {ladder.map((entry, i) => {
          const inner = (
            <>
              <span
                className={`w-4 font-mono text-xs font-bold ${placeColors[i] ?? "text-white"}`}
              >
                {i + 1}.
              </span>
              <Avatar player={entry} size="xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {entry.display_name}
                {entry.is_guest && (
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-bright">
                    guest
                  </span>
                )}
              </span>
              <span className="font-mono text-xs font-bold text-pickle">
                {entry.wins}W
              </span>
            </>
          );
          return entry.is_guest ? (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded-lg p-1.5"
            >
              {inner}
            </div>
          ) : (
            <Link
              key={entry.id}
              href={`/profile/${entry.id}`}
              className="flex items-center gap-2 rounded-lg p-1.5 transition hover:bg-pickle/10"
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
