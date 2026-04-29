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
  prize_1_title: string | null;
  prize_2_title: string | null;
  prize_3_title: string | null;
  prize_image_url: string | null;
  amount_paid_cents: number | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sponsor: any;
}

interface CityOption {
  city: string;
  state: string;
}

interface Props {
  sponsors: Sponsor[];
  sponsorships: SponsorshipRow[];
  cityOptions: CityOption[];
}

/**
 * Two stacked panels:
 *   1. Sponsors — add new sponsors (logo upload to "sponsor-assets" bucket)
 *   2. Sponsorships — bind a sponsor to a city + month with prizes
 *
 * Lives entirely client-side: directly hits Supabase via the admin RLS
 * policies on sponsors / sponsorships. No server actions yet.
 */
export default function SponsorshipManager({
  sponsors,
  sponsorships,
  cityOptions,
}: Props) {
  return (
    <div className="mt-8 space-y-10">
      <SponsorPanel sponsors={sponsors} />
      <SponsorshipPanel
        sponsors={sponsors}
        sponsorships={sponsorships}
        cityOptions={cityOptions}
      />
    </div>
  );
}

// ============================================================
// Panel 1: Sponsors (add new + list existing)
// ============================================================

function SponsorPanel({ sponsors }: { sponsors: Sponsor[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadLogo(file: File): Promise<string> {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("sponsor-assets")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("sponsor-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      let logoUrl: string | null = null;
      if (logoFile) {
        logoUrl = await uploadLogo(logoFile);
      }
      const supabase = createClient();
      const { error } = await supabase.from("sponsors").insert({
        name: name.trim(),
        website: website.trim() || null,
        contact_email: contactEmail.trim() || null,
        short_description: shortDescription.trim() || null,
        logo_url: logoUrl,
      });
      if (error) throw new Error(error.message);
      setName("");
      setWebsite("");
      setContactEmail("");
      setShortDescription("");
      setLogoFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save sponsor");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sponsor and all their sponsorships?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("sponsors").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section>
      <h2 className="font-display text-display-md font-extrabold text-pickle">
        Sponsors
      </h2>
      <p className="mt-1 text-sm text-white/60">
        A sponsor is a business. Logos go to the public{" "}
        <code className="font-mono text-pickle">sponsor-assets</code> bucket.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4 sm:grid-cols-2"
      >
        <Field label="Sponsor name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
            placeholder="e.g. Cactus Branch Co."
          />
        </Field>
        <Field label="Website">
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            type="url"
            className="input"
            placeholder="https://…"
          />
        </Field>
        <Field label="Contact email">
          <input
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            type="email"
            className="input"
            placeholder="ops@example.com"
          />
        </Field>
        <Field label="Logo (PNG/SVG, ≤2 MB)">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="input"
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
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-pickle px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add sponsor"}
          </button>
          {err && <span className="ml-3 text-sm text-bright">⚠ {err}</span>}
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-pickle text-black">
            <tr>
              <Th>Logo</Th>
              <Th>Name</Th>
              <Th>Website</Th>
              <Th>Contact</Th>
              <Th>Description</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {sponsors.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-white/50"
                >
                  No sponsors yet. Add the first one above.
                </td>
              </tr>
            )}
            {sponsors.map((s) => (
              <tr key={s.id} className="border-t-2 border-pickle/30">
                <Td>
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.logo_url}
                      alt={s.name}
                      className="h-10 w-10 rounded border-2 border-pickle bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </Td>
                <Td>
                  <span className="text-white">{s.name}</span>
                </Td>
                <Td>
                  {s.website ? (
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pickle hover:underline"
                    >
                      ↗
                    </a>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-xs text-white/60">
                    {s.contact_email ?? "—"}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs text-white/70">
                    {s.short_description ?? "—"}
                  </span>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="rounded-md border border-bright px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-bright hover:bg-bright hover:text-black"
                  >
                    Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================
// Panel 2: Sponsorships (sponsor × city × month with prizes)
// ============================================================

function SponsorshipPanel({
  sponsors,
  sponsorships,
  cityOptions,
}: {
  sponsors: Sponsor[];
  sponsorships: SponsorshipRow[];
  cityOptions: CityOption[];
}) {
  const router = useRouter();
  const prizeImageRef = useRef<HTMLInputElement | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [sponsorId, setSponsorId] = useState("");
  const [cityKey, setCityKey] = useState(""); // "STATE::city"
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [p1t, setP1t] = useState("");
  const [p1d, setP1d] = useState("");
  const [p2t, setP2t] = useState("");
  const [p2d, setP2d] = useState("");
  const [p3t, setP3t] = useState("");
  const [p3d, setP3d] = useState("");
  const [prizeImageFile, setPrizeImageFile] = useState<File | null>(null);
  const [amountDollars, setAmountDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadPrizeImage(file: File): Promise<string> {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `prizes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("sponsor-assets")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("sponsor-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (!sponsorId) throw new Error("Choose a sponsor");
      if (!cityKey) throw new Error("Choose a city");
      const [stateUp, cityLower] = cityKey.split("::");
      const cityFull =
        cityOptions.find(
          (c) =>
            c.state.toUpperCase() === stateUp &&
            c.city.toLowerCase() === cityLower,
        )?.city ?? cityLower;

      let prizeImageUrl: string | null = null;
      if (prizeImageFile) {
        prizeImageUrl = await uploadPrizeImage(prizeImageFile);
      }

      const amountCents = amountDollars
        ? Math.round(Number(amountDollars) * 100)
        : null;

      const supabase = createClient();
      const { error } = await supabase.from("sponsorships").insert({
        sponsor_id: sponsorId,
        city: cityFull,
        state: stateUp,
        month_key: monthKey,
        prize_1_title: p1t.trim() || null,
        prize_1_description: p1d.trim() || null,
        prize_2_title: p2t.trim() || null,
        prize_2_description: p2d.trim() || null,
        prize_3_title: p3t.trim() || null,
        prize_3_description: p3d.trim() || null,
        prize_image_url: prizeImageUrl,
        amount_paid_cents: amountCents,
        status: "active",
      });
      if (error) throw new Error(error.message);

      // reset form
      setP1t(""); setP1d("");
      setP2t(""); setP2d("");
      setP3t(""); setP3d("");
      setPrizeImageFile(null);
      setAmountDollars("");
      if (prizeImageRef.current) prizeImageRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save sponsorship");
    } finally {
      setBusy(false);
    }
  }

  async function setSponsorshipStatus(id: string, status: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("sponsorships")
      .update({ status })
      .eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section>
      <h2 className="font-display text-display-md font-extrabold text-pickle">
        Sponsorships
      </h2>
      <p className="mt-1 text-sm text-white/60">
        Bind a sponsor to a city for a specific month. Only one{" "}
        <span className="text-pickle">active</span> sponsorship per city +
        month.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4 sm:grid-cols-3"
      >
        <Field label="Sponsor *">
          <select
            value={sponsorId}
            onChange={(e) => setSponsorId(e.target.value)}
            required
            className="input"
          >
            <option value="">— pick sponsor —</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
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

        <Field label="1st prize title">
          <input
            value={p1t}
            onChange={(e) => setP1t(e.target.value)}
            className="input"
            placeholder="e.g. Selkirk Vanguard Paddle"
          />
        </Field>
        <Field label="1st prize details" full>
          <input
            value={p1d}
            onChange={(e) => setP1d(e.target.value)}
            className="input"
            placeholder="$200 retail · pick up at the shop"
          />
        </Field>

        <Field label="2nd prize title">
          <input
            value={p2t}
            onChange={(e) => setP2t(e.target.value)}
            className="input"
            placeholder="$50 gift card"
          />
        </Field>
        <Field label="2nd prize details" full>
          <input
            value={p2d}
            onChange={(e) => setP2d(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="3rd prize title">
          <input
            value={p3t}
            onChange={(e) => setP3t(e.target.value)}
            className="input"
            placeholder="Free can of balls"
          />
        </Field>
        <Field label="3rd prize details" full>
          <input
            value={p3d}
            onChange={(e) => setP3d(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Prize photo (optional)">
          <input
            ref={prizeImageRef}
            type="file"
            accept="image/*"
            onChange={(e) => setPrizeImageFile(e.target.files?.[0] ?? null)}
            className="input"
          />
        </Field>
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
            disabled={busy || !sponsorId || !cityKey}
            className="rounded-lg bg-pickle px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add sponsorship"}
          </button>
          {err && <span className="ml-3 text-sm text-bright">⚠ {err}</span>}
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border-2 border-pickle">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-pickle text-black">
            <tr>
              <Th>Month</Th>
              <Th>City</Th>
              <Th>Sponsor</Th>
              <Th>Prizes</Th>
              <Th>Paid</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {sponsorships.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-white/50"
                >
                  No sponsorships yet. Add a sponsor above, then bind them to
                  a city + month.
                </td>
              </tr>
            )}
            {sponsorships.map((sp) => {
              const sponsor = Array.isArray(sp.sponsor)
                ? sp.sponsor[0]
                : sp.sponsor;
              const prizes = [sp.prize_1_title, sp.prize_2_title, sp.prize_3_title]
                .filter(Boolean)
                .join(", ");
              return (
                <tr key={sp.id} className="border-t-2 border-pickle/30">
                  <Td>
                    <span className="font-mono text-xs text-white/80">
                      {monthLabel(sp.month_key)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-white">
                      {sp.city}, {sp.state}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-white">{sponsor?.name ?? "—"}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-white/70">{prizes || "—"}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-white/60">
                      {sp.amount_paid_cents != null
                        ? `$${(sp.amount_paid_cents / 100).toFixed(2)}`
                        : "—"}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`font-display text-[10px] uppercase font-bold tracking-widest ${
                        sp.status === "active"
                          ? "text-pickle"
                          : sp.status === "expired"
                            ? "text-white/40"
                            : "text-bright"
                      }`}
                    >
                      {sp.status}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {sp.status !== "active" && (
                        <button
                          type="button"
                          onClick={() => setSponsorshipStatus(sp.id, "active")}
                          className="rounded-md bg-pickle px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-black"
                        >
                          Activate
                        </button>
                      )}
                      {sp.status !== "expired" && (
                        <button
                          type="button"
                          onClick={() => setSponsorshipStatus(sp.id, "expired")}
                          className="rounded-md border border-white/30 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10"
                        >
                          Expire
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================
// Helpers
// ============================================================

function buildMonthOptions(): string[] {
  // Returns last 1 month + current + next 6 months in YYYY-MM
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-3 text-left font-display text-display-xs uppercase font-extrabold tracking-wide">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-middle">{children}</td>;
}
