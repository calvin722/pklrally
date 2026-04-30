"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { currentMonthKey, monthLabel } from "@/lib/ladder";

interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  contact_email: string | null;
  short_description: string | null;
  created_at: string;
}

interface SponsorshipRow {
  id: string;
  sponsor_id: string;
  city: string;
  state: string;
  month_key: string;
  status: string;
  slot: number;
  amount_paid_cents: number | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sponsor: any;
}

interface PrizeRow {
  id: string;
  city: string;
  state: string;
  month_key: string;
  place: number;
  title: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

interface CityOption {
  city: string;
  state: string;
}

interface Props {
  sponsors: Sponsor[];
  sponsorships: SponsorshipRow[];
  prizes: PrizeRow[];
  cityOptions: CityOption[];
}

interface SlotState {
  sponsorshipId: string | null;
  sponsorName: string | null;
  sponsorLogo: string | null;
  prizeTitle: string | null;
  prizeImageUrl: string | null;
}

/**
 * One unified form that creates a sponsor + their sponsorship + their prize
 * for a specific city/month/place in one save. Below the form, a grid of
 * (city × month) cards shows all 3 slots with edit/delete actions.
 *
 * Place === slot. 1st place sponsor brings the 1st place prize. Max 3 per
 * city/month, enforced by the DB unique index from migration 0022.
 */
export default function SponsorshipManager({
  sponsors,
  sponsorships,
  prizes,
  cityOptions,
}: Props) {
  const router = useRouter();
  const logoRef = useRef<HTMLInputElement | null>(null);
  const prizeImageRef = useRef<HTMLInputElement | null>(null);
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // Form state
  const [cityKey, setCityKey] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [place, setPlace] = useState<number>(1);
  const [sponsorName, setSponsorName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [prizeTitle, setPrizeTitle] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [prizeImageFile, setPrizeImageFile] = useState<File | null>(null);
  const [amountDollars, setAmountDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ============================================================
  // Build a (city, month) → 3-slot view of existing entries
  // ============================================================
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        city: string;
        state: string;
        monthKey: string;
        slots: Record<number, SlotState>;
      }
    >();

    function ensure(c: string, s: string, m: string) {
      const k = `${m}::${s.toUpperCase()}::${c.toLowerCase()}`;
      if (!map.has(k)) {
        map.set(k, {
          city: c,
          state: s.toUpperCase(),
          monthKey: m,
          slots: {
            1: emptySlot(),
            2: emptySlot(),
            3: emptySlot(),
          },
        });
      }
      return map.get(k)!;
    }

    for (const sp of sponsorships) {
      if (sp.status !== "active") continue;
      const sponsor = Array.isArray(sp.sponsor) ? sp.sponsor[0] : sp.sponsor;
      const entry = ensure(sp.city, sp.state, sp.month_key);
      const slot = entry.slots[sp.slot];
      slot.sponsorshipId = sp.id;
      slot.sponsorName = sponsor?.name ?? null;
      slot.sponsorLogo = sponsor?.logo_url ?? null;
    }
    for (const pr of prizes) {
      const entry = ensure(pr.city, pr.state, pr.month_key);
      const slot = entry.slots[pr.place];
      slot.prizeTitle = pr.title;
      slot.prizeImageUrl = pr.image_url;
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.monthKey !== b.monthKey) return b.monthKey.localeCompare(a.monthKey);
      if (a.state !== b.state) return a.state.localeCompare(b.state);
      return a.city.localeCompare(b.city);
    });
  }, [sponsorships, prizes]);

  // Disable places that already have an entry for the current city/month
  const filledPlaces = useMemo(() => {
    if (!cityKey) return new Set<number>();
    const [stateUp, cityLower] = cityKey.split("::");
    const entry = grouped.find(
      (g) =>
        g.state === stateUp &&
        g.city.toLowerCase() === cityLower &&
        g.monthKey === monthKey,
    );
    if (!entry) return new Set<number>();
    const set = new Set<number>();
    for (const p of [1, 2, 3]) {
      const s = entry.slots[p];
      if (s.sponsorshipId || s.prizeTitle) set.add(p);
    }
    return set;
  }, [cityKey, monthKey, grouped]);

  // ============================================================
  // Helpers
  // ============================================================
  async function uploadFile(
    file: File,
    pathPrefix: string,
  ): Promise<string> {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${pathPrefix}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("sponsor-assets")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("sponsor-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  function resetForm() {
    setSponsorName("");
    setWebsite("");
    setContactEmail("");
    setShortDescription("");
    setLogoFile(null);
    setPrizeTitle("");
    setPrizeDescription("");
    setPrizeImageFile(null);
    setAmountDollars("");
    if (logoRef.current) logoRef.current.value = "";
    if (prizeImageRef.current) prizeImageRef.current.value = "";
    setErr(null);
  }

  // ============================================================
  // Submit: create sponsor + sponsorship + prize in one shot
  // ============================================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (!cityKey) throw new Error("Choose a city");
      if (!sponsorName.trim()) throw new Error("Sponsor name is required");
      if (filledPlaces.has(place)) {
        throw new Error(
          `${ordinal(place)} place is already taken for this city + month. Delete the existing one first.`,
        );
      }
      const [stateUp, cityLower] = cityKey.split("::");
      const cityFull =
        cityOptions.find(
          (c) =>
            c.state.toUpperCase() === stateUp &&
            c.city.toLowerCase() === cityLower,
        )?.city ?? cityLower;

      let logoUrl: string | null = null;
      if (logoFile) logoUrl = await uploadFile(logoFile, "logos");

      let prizeImageUrl: string | null = null;
      if (prizeImageFile)
        prizeImageUrl = await uploadFile(prizeImageFile, "prizes");

      const supabase = createClient();

      // 1. Create sponsor row
      const { data: sponsorRow, error: sponsorErr } = await supabase
        .from("sponsors")
        .insert({
          name: sponsorName.trim(),
          website: website.trim() || null,
          contact_email: contactEmail.trim() || null,
          short_description: shortDescription.trim() || null,
          logo_url: logoUrl,
        })
        .select("id")
        .single();
      if (sponsorErr) throw new Error(`Sponsor: ${sponsorErr.message}`);

      const amountCents = amountDollars
        ? Math.round(Number(amountDollars) * 100)
        : null;

      // 2. Create sponsorship binding
      const { error: spErr } = await supabase.from("sponsorships").insert({
        sponsor_id: sponsorRow.id,
        city: cityFull,
        state: stateUp,
        month_key: monthKey,
        slot: place,
        status: "active",
        amount_paid_cents: amountCents,
      });
      if (spErr) throw new Error(`Sponsorship: ${spErr.message}`);

      // 3. Create prize (only if any prize info was filled in)
      if (prizeTitle.trim() || prizeDescription.trim() || prizeImageUrl) {
        const { error: prizeErr } = await supabase
          .from("ladder_prizes")
          .insert({
            city: cityFull,
            state: stateUp,
            month_key: monthKey,
            place,
            title: prizeTitle.trim() || null,
            description: prizeDescription.trim() || null,
            image_url: prizeImageUrl,
          });
        if (prizeErr) throw new Error(`Prize: ${prizeErr.message}`);
      }

      resetForm();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  // ============================================================
  // Delete a slot — removes sponsorship + prize (cascades delete sponsor
  // because we always create a fresh sponsor row per sponsorship)
  // ============================================================
  async function handleDeleteSlot(
    city: string,
    state: string,
    month: string,
    slot: number,
    sponsorshipId: string | null,
  ) {
    if (!confirm(`Delete the ${ordinal(slot)} slot for ${city}, ${state} ${monthLabel(month)}?`))
      return;
    const supabase = createClient();

    // Look up sponsor_id from sponsorship to delete it after
    let sponsorId: string | null = null;
    if (sponsorshipId) {
      const sp = sponsorships.find((s) => s.id === sponsorshipId);
      if (sp) sponsorId = sp.sponsor_id;
    }

    // Delete sponsorship row
    if (sponsorshipId) {
      const { error: e1 } = await supabase
        .from("sponsorships")
        .delete()
        .eq("id", sponsorshipId);
      if (e1) {
        alert(`Sponsorship delete failed: ${e1.message}`);
        return;
      }
    }
    // Delete prize row
    const { error: e2 } = await supabase
      .from("ladder_prizes")
      .delete()
      .ilike("city", city)
      .ilike("state", state)
      .eq("month_key", month)
      .eq("place", slot);
    if (e2) {
      alert(`Prize delete failed: ${e2.message}`);
      return;
    }
    // Delete sponsor row (since each entry creates its own)
    if (sponsorId) {
      await supabase.from("sponsors").delete().eq("id", sponsorId);
    }
    router.refresh();
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="mt-8 space-y-10">
      {/* Form */}
      <section>
        <h2 className="font-display text-display-md font-extrabold text-pickle">
          Add a sponsor + prize
        </h2>
        <p className="mt-1 text-sm text-white/60">
          One sponsor brings the prize for one place (1st / 2nd / 3rd) in a
          city for a month. Max three per city per month.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-4 grid gap-3 rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4 sm:grid-cols-3"
        >
          {/* Where + when + place */}
          <Field label="City *">
            <select
              value={cityKey}
              onChange={(e) => setCityKey(e.target.value)}
              required
              className="input"
            >
              <option value="">— pick city —</option>
              {cityOptions.map((c) => (
                <option
                  key={`${c.state}-${c.city}`}
                  value={`${c.state.toUpperCase()}::${c.city.toLowerCase()}`}
                >
                  {c.city}, {c.state}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Month *">
            <select
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="input"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Place *">
            <select
              value={place}
              onChange={(e) => setPlace(Number(e.target.value))}
              className="input"
            >
              {[1, 2, 3].map((p) => (
                <option key={p} value={p} disabled={filledPlaces.has(p)}>
                  {ordinal(p)} place
                  {filledPlaces.has(p) ? " (taken)" : ""}
                </option>
              ))}
            </select>
          </Field>

          {/* Sponsor info */}
          <div className="sm:col-span-3 mt-2 border-t border-white/10 pt-3">
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              Sponsor
            </p>
          </div>
          <Field label="Sponsor name *">
            <input
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              required
              className="input"
              placeholder="e.g. Selkirk Sport"
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="input"
              placeholder="https://…"
            />
          </Field>
          <Field label="Logo (PNG/SVG)">
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="input"
              placeholder="ops@example.com"
            />
          </Field>
          <Field label="Short description (1 line)" full>
            <input
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={140}
              className="input"
              placeholder="Local pickleball pro shop · Las Cruces, NM"
            />
          </Field>

          {/* Prize info */}
          <div className="sm:col-span-3 mt-2 border-t border-white/10 pt-3">
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              Prize
            </p>
          </div>
          <Field label="Prize title">
            <input
              value={prizeTitle}
              onChange={(e) => setPrizeTitle(e.target.value)}
              className="input"
              placeholder="e.g. $100 gift card"
            />
          </Field>
          <Field label="Prize description" full>
            <input
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              className="input"
              placeholder="Pickup at the shop · expires Dec 31"
            />
          </Field>
          <Field label="Prize image (optional)">
            <input
              ref={prizeImageRef}
              type="file"
              accept="image/*"
              onChange={(e) => setPrizeImageFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          </Field>

          {/* Amount */}
          <div className="sm:col-span-3 mt-2 border-t border-white/10 pt-3">
            <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
              Payment
            </p>
          </div>
          <Field label="Amount paid (USD)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              className="input"
              placeholder="e.g. 99.00"
            />
          </Field>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={busy || !cityKey || !sponsorName.trim()}
              className="rounded-lg bg-pickle px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save sponsor + prize"}
            </button>
            {err && <span className="ml-3 text-sm text-bright">⚠ {err}</span>}
          </div>
        </form>
      </section>

      {/* Existing entries grouped by city + month */}
      <section>
        <h2 className="font-display text-display-md font-extrabold text-pickle">
          Existing sponsors
        </h2>
        {grouped.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">
            No sponsors added yet. Use the form above to add the first one.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {grouped.map((g) => {
              const k = `${g.monthKey}-${g.state}-${g.city}`;
              return (
                <div
                  key={k}
                  className="rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-display-base font-extrabold text-bright">
                      {g.city}, {g.state}
                    </h3>
                    <p className="font-mono text-xs uppercase tracking-wider text-pickle">
                      {monthLabel(g.monthKey)}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map((p) => {
                      const slot = g.slots[p];
                      const filled = !!(
                        slot.sponsorshipId || slot.prizeTitle
                      );
                      return (
                        <div
                          key={p}
                          className={`rounded-xl border-2 p-3 ${
                            filled
                              ? "border-pickle/40 bg-pickle/5"
                              : "border-white/15 bg-black/30"
                          }`}
                        >
                          <p className="font-display text-[10px] uppercase font-extrabold tracking-widest text-pickle">
                            {ordinal(p)} place
                          </p>
                          {filled ? (
                            <>
                              <div className="mt-2 flex items-start gap-2">
                                {slot.sponsorLogo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={slot.sponsorLogo}
                                    alt=""
                                    className="h-8 w-8 rounded border-2 border-pickle/40 bg-white object-contain p-0.5"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded border-2 border-white/20 bg-black" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-display text-display-xs font-bold text-white">
                                    {slot.sponsorName ?? "—"}
                                  </p>
                                  {slot.prizeTitle && (
                                    <p className="mt-0.5 truncate text-xs text-white/70">
                                      {slot.prizeTitle}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteSlot(
                                    g.city,
                                    g.state,
                                    g.monthKey,
                                    p,
                                    slot.sponsorshipId,
                                  )
                                }
                                className="mt-3 rounded border border-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setCityKey(
                                  `${g.state.toUpperCase()}::${g.city.toLowerCase()}`,
                                );
                                setMonthKey(g.monthKey);
                                setPlace(p);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="mt-2 text-xs uppercase tracking-wider text-pickle hover:text-bright"
                            >
                              + Add to this slot
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sponsors-only list (unbound to a sponsorship) — kept for reference */}
        {sponsors.length > 0 && (
          <details className="mt-6 rounded-xl border-2 border-white/15 bg-white/[0.02] p-3">
            <summary className="cursor-pointer font-display text-display-xs uppercase font-bold tracking-widest text-white/60">
              Raw sponsor table ({sponsors.length})
            </summary>
            <ul className="mt-3 space-y-1 text-xs text-white/70">
              {sponsors.map((s) => (
                <li key={s.id} className="font-mono">
                  {s.name} — {new Date(s.created_at).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function emptySlot(): SlotState {
  return {
    sponsorshipId: null,
    sponsorName: null,
    sponsorLogo: null,
    prizeTitle: null,
    prizeImageUrl: null,
  };
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function buildMonthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let offset = -1; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${yyyy}-${mm}`);
  }
  return out;
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs uppercase tracking-wider text-white/60 ${
        full ? "sm:col-span-2" : ""
      }`}
    >
      {label}
      {children}
    </label>
  );
}
