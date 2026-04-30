"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { monthLabel } from "@/lib/ladder";

interface Props {
  currentOverride: string | null;
  calendarMonthKey: string;
}

/**
 * Admin control for the league_month_override setting (migration 0025).
 * When set, all newly-logged matches and the ladder page default to
 * that month, regardless of calendar date.
 */
export default function LeagueMonthControl({
  currentOverride,
  calendarMonthKey,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let offset = -1; offset <= 6; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      out.push(`${yyyy}-${mm}`);
    }
    return out;
  }, []);

  async function setOverride(value: string | null) {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("app_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", "league_month_override");
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  const effectiveMonth = currentOverride ?? calendarMonthKey;

  return (
    <section className="rounded-2xl border-2 border-pickle bg-black p-5 neon-pickle">
      <h2 className="font-display text-display-md font-extrabold uppercase tracking-tight text-pickle">
        Active League Month
      </h2>
      <p className="mt-2 text-sm text-white/60">
        New matches and the ladder default to this month. Override the
        calendar month here when you want to start a new league early.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-xs uppercase tracking-wider text-white/60">
          <span>Effective month</span>
          <span className="font-display text-display-base font-extrabold text-bright">
            {monthLabel(effectiveMonth)}
          </span>
          <span className="font-mono text-[10px] text-white/40">
            {currentOverride
              ? `override active (${currentOverride})`
              : `calendar default (${calendarMonthKey})`}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-xs uppercase tracking-wider text-white/60">
          <span>Set override</span>
          <select
            value={currentOverride ?? ""}
            onChange={(e) =>
              setOverride(e.target.value ? e.target.value : null)
            }
            disabled={busy}
            className="input"
          >
            <option value="">— calendar default —</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {currentOverride && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setOverride(null)}
            className="rounded-lg border-2 border-white/30 px-3 py-2 font-display text-display-xs uppercase font-bold tracking-wide text-white/70 hover:border-pickle hover:text-pickle"
          >
            Clear override
          </button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-bright">⚠ {err}</p>}
    </section>
  );
}
