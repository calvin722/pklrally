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
  prizes,
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
      <PrizesPanel prizes={prizes} cityOptions={cityOptions} />
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
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [sponsorId, setSponsorId] = useState("");
  const [cityKey, setCityKey] = useState(""); // "STATE::city"
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [slot, setSlot] = useState<number>(1);
  const [amountDollars, setAmountDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

      const amountCents = amountDollars
        ? Math.round(Number(amountDollars) * 100)
        : null;

      const supabase = createClient();
      const { error } = await supabase.from("sponsorships").insert({
        sponsor_id: sponsorId,
        city: cityFull,
        state: stateUp,
        month_key: monthKey,
        slot,
        amount_paid_cents: amountCents,
        status: "active",
      });
      if (error) throw new Error(error.message);

      setAmountDollars("");
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
        Bind a sponsor to one of three slots in a city for a specific month.
        Each city + month + slot can hold one active sponsor. Prizes are
        managed in the panel below.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4 sm:grid-cols-4"
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
        <Field label="Slot *">
          <select
            value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
            className="input"
          >
            <option value={1}>Slot 1</option>
            <option value={2}>Slot 2</option>
            <option value={3}>Slot 3</option>
          </select>
        </Field>

        <Field label="Amount paid (USD)" full>
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

        <div className="sm:col-span-4">
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
              <Th>Slot</Th>
              <Th>Sponsor</Th>
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
                  a city + month + slot.
                </td>
              </tr>
            )}
            {sponsorships.map((sp) => {
              const sponsor = Array.isArray(sp.sponsor)
                ? sp.sponsor[0]
                : sp.sponsor;
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
                    <span className="font-mono text-xs text-pickle">
                      {sp.slot}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-white">{sponsor?.name ?? "—"}</span>
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
// Panel 3: Prizes (1st / 2nd / 3rd per city + month)
// ============================================================

function PrizesPanel({
  prizes,
  cityOptions,
}: {
  prizes: PrizeRow[];
  cityOptions: CityOption[];
}) {
  const router = useRouter();
  const imageRef = useRef<HTMLInputElement | null>(null);
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [cityKey, setCityKey] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [place, setPlace] = useState<number>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadImage(file: File): Promise<string> {
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
      if (!cityKey) throw new Error("Choose a city");
      const [stateUp, cityLower] = cityKey.split("::");
      const cityFull =
        cityOptions.find(
          (c) =>
            c.state.toUpperCase() === stateUp &&
            c.city.toLowerCase() === cityLower,
        )?.city ?? cityLower;

      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      const supabase = createClient();
      // Upsert: if a prize exists for this city/month/place, replace it.
      // Otherwise insert new.
      const { data: existing } = await supabase
        .from("ladder_prizes")
        .select("id")
        .ilike("city", cityFull)
        .ilike("state", stateUp)
        .eq("month_key", monthKey)
        .eq("place", place)
        .maybeSingle();

      const payload = {
        city: cityFull,
        state: stateUp,
        month_key: monthKey,
        place,
        title: title.trim() || null,
        description: description.trim() || null,
        ...(imageUrl ? { image_url: imageUrl } : {}),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("ladder_prizes")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("ladder_prizes")
          .insert(payload);
        if (error) throw new Error(error.message);
      }

      setTitle("");
      setDescription("");
      setImageFile(null);
      if (imageRef.current) imageRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save prize");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this prize?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("ladder_prizes")
      .delete()
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
        Prizes
      </h2>
      <p className="mt-1 text-sm text-white/60">
        Set 1st, 2nd, and 3rd place prizes per city + month. Each prize can
        have a title, description, and image (any combination). Submitting
        again for the same place updates the existing prize.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4 sm:grid-cols-3"
      >
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
            <option value={1}>1st</option>
            <option value={2}>2nd</option>
            <option value={3}>3rd</option>
          </select>
        </Field>

        <Field label="Title" full>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. Selkirk Vanguard Paddle"
          />
        </Field>
        <Field label="Image (optional)">
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="input"
          />
        </Field>

        <Field label="Description" full>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="$200 retail · pick up at the shop"
          />
        </Field>

        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={busy || !cityKey}
            className="rounded-lg bg-pickle px-4 py-2 font-display text-display-xs font-bold uppercase tracking-wide text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save prize"}
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
              <Th>Place</Th>
              <Th>Image</Th>
              <Th>Title</Th>
              <Th>Description</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {prizes.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-white/50"
                >
                  No prizes yet.
                </td>
              </tr>
            )}
            {prizes.map((p) => (
              <tr key={p.id} className="border-t-2 border-pickle/30">
                <Td>
                  <span className="font-mono text-xs text-white/80">
                    {monthLabel(p.month_key)}
                  </span>
                </Td>
                <Td>
                  <span className="text-white">
                    {p.city}, {p.state}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-pickle">
                    {p.place === 1 ? "1st" : p.place === 2 ? "2nd" : "3rd"}
                  </span>
                </Td>
                <Td>
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.title ?? ""}
                      className="h-10 w-16 rounded border-2 border-pickle/40 object-cover"
                    />
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </Td>
                <Td>
                  <span className="text-white">{p.title ?? "—"}</span>
                </Td>
                <Td>
                  <span className="text-xs text-white/70">
                    {p.description ?? "—"}
                  </span>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
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
