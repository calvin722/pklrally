"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type League,
  type LeaguePrize,
  updateLeague,
  savePrize,
  deletePrize,
  uploadPrizeImage,
} from "@/lib/leagues";
import CourtPicker from "./CourtPicker";
import PrizesSection, {
  type PrizeDraft,
  EMPTY_PRIZE,
} from "./PrizesSection";

const inputStyle =
  "w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

const labelStyle =
  "block font-display text-display-xs uppercase font-semibold tracking-wide text-white/80";

const helpStyle = "mt-1 text-xs text-white/50";

interface Props {
  league: League;
  prizes: LeaguePrize[];
}

function isoLocalDateTime(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0") +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

export default function EditLeagueForm({ league, prizes }: Props) {
  const router = useRouter();

  const initialDate = league.scheduled_at
    ? new Date(league.scheduled_at)
    : null;

  const [name, setName] = useState(league.name);
  const [description, setDescription] = useState(league.description ?? "");
  const [date, setDate] = useState(
    initialDate
      ? initialDate.getFullYear() +
          "-" +
          String(initialDate.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(initialDate.getDate()).padStart(2, "0")
      : "",
  );
  const [time, setTime] = useState(
    initialDate
      ? String(initialDate.getHours()).padStart(2, "0") +
          ":" +
          String(initialDate.getMinutes()).padStart(2, "0")
      : "",
  );
  const [nSessions, setNSessions] = useState(league.n_sessions);
  // sessionOverrides: index => "YYYY-MM-DDTHH:mm" string
  const initialOverrides: Record<number, string> = {};
  if (league.session_dates) {
    league.session_dates.forEach((iso, i) => {
      // Only treat as override if it deviates from default weekly +7 days
      const first = initialDate;
      if (!first) return;
      const expected = new Date(
        first.getTime() + i * 7 * 24 * 60 * 60 * 1000,
      );
      const actual = new Date(iso);
      if (Math.abs(expected.getTime() - actual.getTime()) > 60_000) {
        initialOverrides[i] = isoLocalDateTime(actual);
      }
    });
  }
  const [sessionOverrides, setSessionOverrides] =
    useState<Record<number, string>>(initialOverrides);

  const [courtId, setCourtId] = useState<string | null>(league.court_id);
  const [manualCourtName, setManualCourtName] = useState(
    league.manual_court_name ?? "",
  );
  const [manualCourtAddress, setManualCourtAddress] = useState(
    league.manual_court_address ?? "",
  );

  const [nCourts, setNCourts] = useState(league.n_courts);
  const [nRounds, setNRounds] = useState(league.n_rounds);
  const [winBonus, setWinBonus] = useState(league.win_bonus);
  const [courtRules, setCourtRules] = useState(league.court_rules ?? "");
  const [partnerMode, setPartnerMode] = useState<"shuffled" | "fixed">(
    league.partner_mode,
  );

  // Build PrizeDrafts from existing prizes
  const initialPrizes: [PrizeDraft, PrizeDraft, PrizeDraft] = [
    { ...EMPTY_PRIZE },
    { ...EMPTY_PRIZE },
    { ...EMPTY_PRIZE },
  ];
  for (const p of prizes) {
    if (p.place < 1 || p.place > 3) continue;
    initialPrizes[p.place - 1] = {
      description: p.description ?? "",
      sponsorName: p.sponsor_name ?? "",
      file: null,
      previewUrl: p.sponsor_image_url,
      existingPath: p.sponsor_image_path,
    };
  }
  const [prizeDrafts, setPrizeDrafts] =
    useState<[PrizeDraft, PrizeDraft, PrizeDraft]>(initialPrizes);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function computeSessionDates(): Date[] | null {
    if (!date) return null;
    const t = time || "18:00";
    const first = new Date(`${date}T${t}`);
    if (Number.isNaN(first.getTime())) return null;
    const out: Date[] = [];
    for (let i = 0; i < nSessions; i++) {
      const override = sessionOverrides[i];
      if (override) {
        const d = new Date(override);
        if (!Number.isNaN(d.getTime())) {
          out.push(d);
          continue;
        }
      }
      const d = new Date(first.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      out.push(d);
    }
    return out;
  }
  const sessionDatesPreview = computeSessionDates();

  function setSessionOverride(i: number, value: string) {
    setSessionOverrides((prev) => {
      const next = { ...prev };
      if (value) next[i] = value;
      else delete next[i];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("League needs a name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sessions = sessionDatesPreview;
      const scheduledAt = sessions?.[0] ?? null;

      await updateLeague({
        id: league.id,
        name,
        description,
        scheduledAt,
        courtId,
        manualCourtName,
        manualCourtAddress,
        nCourts,
        nRounds,
        nSessions,
        sessionDates: sessions ?? null,
        winBonus,
        courtRules,
        partnerMode,
      });

      // Sync prizes
      for (let i = 0; i < 3; i++) {
        const p = prizeDrafts[i];
        const place = (i + 1) as 1 | 2 | 3;
        const hasContent =
          p.description.trim() || p.sponsorName.trim() || p.file || p.existingPath;
        if (!hasContent) {
          // User cleared this prize — delete it (no-op if it didn't exist)
          await deletePrize(league.id, place);
          continue;
        }
        let imagePath: string | null = p.existingPath ?? null;
        if (p.file) {
          const { path } = await uploadPrizeImage(league.id, place, p.file);
          imagePath = path;
        }
        await savePrize({
          leagueId: league.id,
          place,
          description: p.description,
          sponsorName: p.sponsorName,
          sponsorImagePath: imagePath,
        });
      }

      router.push(`/leagues/${league.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-8">
      {/* -------- Basics -------- */}
      <section className="space-y-4">
        <SectionTitle>Basics</SectionTitle>

        <div>
          <label className={labelStyle}>
            League name
            <input
              type="text"
              className={`mt-2 ${inputStyle}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tuesday League"
              maxLength={120}
            />
          </label>
        </div>

        <div>
          <label className={labelStyle}>
            Description
            <textarea
              className={`mt-2 ${inputStyle} min-h-[100px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this league? Skill level, vibe, anything players should know."
              maxLength={1000}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className={labelStyle}>
            First date
            <input
              type="date"
              className={`mt-2 ${inputStyle}`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className={labelStyle}>
            Start time
            <input
              type="time"
              className={`mt-2 ${inputStyle}`}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>

        <div>
          <label className={labelStyle}>
            Number of sessions
            <input
              type="number"
              min={1}
              max={52}
              className={`mt-2 ${inputStyle}`}
              value={nSessions}
              onChange={(e) =>
                setNSessions(
                  Math.max(1, Math.min(52, Number(e.target.value) || 1)),
                )
              }
            />
          </label>
          <p className={helpStyle}>
            1 = single day. More = recurring (defaults to same day &amp;
            time every week — override individual dates below).
          </p>
        </div>

        {nSessions > 1 && sessionDatesPreview && (
          <div className="rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-4">
            <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
              Schedule preview
            </div>
            <div className="mt-3 space-y-2">
              {sessionDatesPreview.map((d, i) => {
                const isoLocal = isoLocalDateTime(d);
                const overridden = !!sessionOverrides[i];
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border-2 border-white/15 bg-black px-3 py-2"
                  >
                    <span className="w-20 shrink-0 font-display text-display-xs uppercase font-bold tracking-wide text-bright">
                      Session {i + 1}
                    </span>
                    <input
                      type="datetime-local"
                      value={isoLocal}
                      onChange={(e) => setSessionOverride(i, e.target.value)}
                      className="flex-1 rounded-md border-2 border-white/30 bg-black px-2 py-1.5 text-sm text-white focus:border-pickle focus:outline-none"
                    />
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => setSessionOverride(i, "")}
                        className="text-xs text-white/40 hover:text-bright"
                      >
                        reset
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className={labelStyle}>Court</div>
          <div className="mt-2">
            <CourtPicker
              courtId={courtId}
              manualName={manualCourtName}
              manualAddress={manualCourtAddress}
              onChange={(v) => {
                setCourtId(v.courtId);
                setManualCourtName(v.manualName);
                setManualCourtAddress(v.manualAddress);
              }}
            />
          </div>
        </div>
      </section>

      {/* -------- Format -------- */}
      <section className="space-y-4">
        <SectionTitle>Format</SectionTitle>

        <div className="grid grid-cols-2 gap-4">
          <label className={labelStyle}>
            Courts
            <input
              type="number"
              min={1}
              max={10}
              className={`mt-2 ${inputStyle}`}
              value={nCourts}
              onChange={(e) =>
                setNCourts(Math.max(1, Math.min(10, Number(e.target.value) || 4)))
              }
            />
          </label>

          <label className={labelStyle}>
            Rounds (per session)
            <input
              type="number"
              min={1}
              max={30}
              className={`mt-2 ${inputStyle}`}
              value={nRounds}
              onChange={(e) =>
                setNRounds(Math.max(1, Math.min(30, Number(e.target.value) || 10)))
              }
            />
          </label>
        </div>

        <div>
          <label className={labelStyle}>
            Win bonus
            <input
              type="number"
              min={0}
              max={50}
              className={`mt-2 ${inputStyle}`}
              value={winBonus}
              onChange={(e) =>
                setWinBonus(Math.max(0, Math.min(50, Number(e.target.value) || 10)))
              }
            />
          </label>
        </div>

        <div>
          <label className={labelStyle}>
            Court rules
            <input
              type="text"
              className={`mt-2 ${inputStyle}`}
              value={courtRules}
              onChange={(e) => setCourtRules(e.target.value)}
              placeholder="e.g. 11, win by 1 (hard cap)"
              maxLength={200}
            />
          </label>
        </div>

        <div>
          <p className={labelStyle}>Partner mode</p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setPartnerMode("shuffled")}
              className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition ${
                partnerMode === "shuffled"
                  ? "border-pickle bg-pickle/10"
                  : "border-white/30 hover:border-white"
              }`}
            >
              <div className="font-display text-display-xs uppercase font-bold tracking-wide text-pickle">
                Shuffled (recommended)
              </div>
              <div className="mt-1 text-xs text-white/70">
                Fresh partners every round. Individuals climb.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPartnerMode("fixed")}
              className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition ${
                partnerMode === "fixed"
                  ? "border-pickle bg-pickle/10"
                  : "border-white/30 hover:border-white"
              }`}
            >
              <div className="font-display text-display-xs uppercase font-bold tracking-wide text-white">
                Fixed partners
              </div>
              <div className="mt-1 text-xs text-white/70">
                Sign up as a 2-person team that climbs together.
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* -------- Prizes -------- */}
      <section>
        <SectionTitle>Sponsors / Prizes</SectionTitle>
        <div className="mt-3">
          <PrizesSection prizes={prizeDrafts} onChange={setPrizeDrafts} />
        </div>
      </section>

      {error && (
        <p className="rounded-lg border-2 border-bright bg-bright/10 px-4 py-3 text-sm text-bright">
          ⚠ {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push(`/leagues/${league.id}`)}
          disabled={saving}
          className="rounded-lg border-2 border-white/30 px-6 py-4 font-display text-display-xs font-bold uppercase tracking-wide text-white/80 hover:border-bright hover:text-bright"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black transition hover:bg-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes →"}
        </button>
      </div>
    </form>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b-2 border-pickle/40 pb-2 font-display text-display-base font-extrabold text-bright">
      {children}
    </h2>
  );
}
