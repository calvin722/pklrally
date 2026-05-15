"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLeague, savePrize, uploadPrizeImage } from "@/lib/leagues";
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
  playerId: string;
}

export default function CreateLeagueForm({ playerId }: Props) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [courtId, setCourtId] = useState<string | null>(null);
  const [manualCourtName, setManualCourtName] = useState("");
  const [manualCourtAddress, setManualCourtAddress] = useState("");

  const [nCourts, setNCourts] = useState(4);
  const [nRounds, setNRounds] = useState(10);
  const [winBonus, setWinBonus] = useState(10);
  const [courtRules, setCourtRules] = useState("11, win by 1 (hard cap)");
  const [partnerMode, setPartnerMode] = useState<"shuffled" | "fixed">("shuffled");

  const [prizes, setPrizes] = useState<[PrizeDraft, PrizeDraft, PrizeDraft]>([
    { ...EMPTY_PRIZE },
    { ...EMPTY_PRIZE },
    { ...EMPTY_PRIZE },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minPlayers = nCourts * 4;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("League needs a name");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // Combine date + time into a single timestamp (in user's local TZ).
      let scheduledAt: Date | null = null;
      if (date) {
        const t = time || "18:00";
        const local = new Date(`${date}T${t}`);
        if (!Number.isNaN(local.getTime())) scheduledAt = local;
      }

      const { id } = await createLeague({
        name,
        description,
        scheduledAt,
        createdBy: playerId,
        courtId,
        manualCourtName,
        manualCourtAddress,
        nCourts,
        nRounds,
        winBonus,
        courtRules,
        partnerMode,
      });

      // Save prizes (skip empty ones)
      for (let i = 0; i < 3; i++) {
        const p = prizes[i];
        const hasContent =
          p.description.trim() || p.sponsorName.trim() || p.file;
        if (!hasContent) continue;
        let imagePath: string | null = null;
        if (p.file) {
          const place = (i + 1) as 1 | 2 | 3;
          const { path } = await uploadPrizeImage(id, place, p.file);
          imagePath = path;
        }
        await savePrize({
          leagueId: id,
          place: (i + 1) as 1 | 2 | 3,
          description: p.description,
          sponsorName: p.sponsorName,
          sponsorImagePath: imagePath,
        });
      }

      router.push(`/leagues/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create league");
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
              autoFocus
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
            Date
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
            <p className={helpStyle}>
              4 courts holds {nCourts * 4} players. Plus byes if you have more.
            </p>
          </label>

          <label className={labelStyle}>
            Rounds
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
            <p className={helpStyle}>
              ~10–12 min per round → {nRounds} rounds ≈{" "}
              {Math.round((nRounds * 11) / 60 * 10) / 10}h
            </p>
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
          <p className={helpStyle}>
            Extra points each winner earns on top of their game score. Default 10.
          </p>
        </div>

        <div>
          <label className={labelStyle}>
            Court rules
            <input
              type="text"
              className={`mt-2 ${inputStyle}`}
              value={courtRules}
              onChange={(e) => setCourtRules(e.target.value)}
              placeholder="e.g. 11, win by 1 (hard cap) or 10-min high score"
              maxLength={200}
            />
          </label>
          <p className={helpStyle}>
            What rule do games end on? Free text — players see this on every round.
          </p>
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
          {partnerMode === "fixed" && (
            <p className="mt-2 text-xs text-bright">
              Heads up: fixed-partner mode is on the roadmap but not fully wired in v1.
              Shuffled is the supported flow today.
            </p>
          )}
        </div>
      </section>

      {/* -------- Prizes -------- */}
      <section>
        <SectionTitle>Sponsors / Prizes</SectionTitle>
        <div className="mt-3">
          <PrizesSection prizes={prizes} onChange={setPrizes} />
        </div>
      </section>

      <div className="rounded-lg border-2 border-pickle/40 bg-pickle/5 px-4 py-3 text-sm text-white/80">
        <strong className="text-pickle">Up next:</strong> after creating, you&rsquo;ll
        add players ({minPlayers}+ recommended) and invite them by email.
      </div>

      {error && (
        <p className="rounded-lg border-2 border-bright bg-bright/10 px-4 py-3 text-sm text-bright">
          ⚠ {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="w-full rounded-lg bg-pickle px-6 py-4 font-display text-display-base font-extrabold uppercase tracking-wide text-black transition hover:bg-bright disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create League →"}
      </button>
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
