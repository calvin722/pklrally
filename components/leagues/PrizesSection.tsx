"use client";

import { useEffect } from "react";

export interface PrizeDraft {
  description: string;
  sponsorName: string;
  /** Newly-uploaded file. When present, replaces existingPath on save. */
  file: File | null;
  /** Either a blob URL (from `file`) or the public URL of the existing image. */
  previewUrl: string | null;
  /** The storage path of an already-saved image, if any. Set by the edit
   *  form when loading existing prizes. Cleared when user picks a new
   *  file or removes the image. */
  existingPath?: string | null;
}

export const EMPTY_PRIZE: PrizeDraft = {
  description: "",
  sponsorName: "",
  file: null,
  previewUrl: null,
  existingPath: null,
};

interface Props {
  prizes: [PrizeDraft, PrizeDraft, PrizeDraft];
  onChange: (next: [PrizeDraft, PrizeDraft, PrizeDraft]) => void;
}

const PLACE_LABELS = ["🥇 1st place", "🥈 2nd place", "🥉 3rd place"] as const;
const inputStyle =
  "w-full rounded-lg border-2 border-white/30 bg-black px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

export default function PrizesSection({ prizes, onChange }: Props) {
  // Clean up object URLs on unmount or when files change
  useEffect(() => {
    return () => {
      prizes.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(i: 0 | 1 | 2, patch: Partial<PrizeDraft>) {
    const next: [PrizeDraft, PrizeDraft, PrizeDraft] = [
      { ...prizes[0] },
      { ...prizes[1] },
      { ...prizes[2] },
    ];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function handleFile(i: 0 | 1 | 2, file: File | null) {
    // Only revoke if the previous previewUrl was a blob URL (from a File).
    const prev = prizes[i].previewUrl;
    if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    const previewUrl = file ? URL.createObjectURL(file) : null;
    // Picking a new file (or clearing) supersedes any existing stored image.
    update(i, { file, previewUrl, existingPath: null });
  }

  return (
    <div>
      <h3 className="font-display text-display-sm font-bold text-pickle">
        Sponsors / Prizes (optional)
      </h3>
      <p className="mt-1 text-xs text-white/60">
        Add prizes for the top finishers. Sponsor logos will show on the final
        standings page. Skip any that don&rsquo;t apply.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {([0, 1, 2] as const).map((i) => {
          const p = prizes[i];
          return (
            <div
              key={i}
              className="rounded-2xl border-2 border-pickle/40 bg-pickle/5 p-3"
            >
              <div className="font-display text-display-xs uppercase font-bold tracking-wide text-bright">
                {PLACE_LABELS[i]}
              </div>

              <textarea
                value={p.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Prize description (e.g. $50 gift card + free paddle)"
                rows={2}
                maxLength={300}
                className={`mt-2 ${inputStyle}`}
              />
              <input
                type="text"
                value={p.sponsorName}
                onChange={(e) => update(i, { sponsorName: e.target.value })}
                placeholder="Sponsor name (e.g. Cactus Branch Co.)"
                maxLength={120}
                className={`mt-2 ${inputStyle}`}
              />

              <div className="mt-2">
                {p.previewUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.previewUrl}
                      alt={`${PLACE_LABELS[i]} sponsor`}
                      className="h-28 w-full rounded-lg border-2 border-pickle/30 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleFile(i, null)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/40 bg-black/80 text-xs text-white hover:border-bright hover:text-bright"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/30 text-xs text-white/50 transition hover:border-pickle hover:text-pickle">
                    <span className="text-2xl">📷</span>
                    <span>Upload sponsor logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        handleFile(i, f);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
