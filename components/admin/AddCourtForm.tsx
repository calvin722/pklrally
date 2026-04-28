"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const inputStyle =
  "w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

// Mapbox's SearchBox touches `document` at module load — must be client-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SearchBox = dynamic(
  () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("@mapbox/search-js-react").then((mod) => mod.SearchBox as any),
  {
    ssr: false,
    loading: () => (
      <input className={inputStyle} placeholder="Loading search..." disabled />
    ),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface MapboxFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    feature_type?: string;
    full_address?: string;
    place_formatted?: string;
    context?: {
      place?: { name?: string };
      region?: { region_code?: string; name?: string };
    };
  };
}

export default function AddCourtForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [notes, setNotes] = useState("");

  const [searchValue, setSearchValue] = useState("");
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  function handleRetrieve(res: { features?: MapboxFeature[] }) {
    const feature = res?.features?.[0];
    if (!feature) return;

    const [lng, lat] = feature.geometry.coordinates;
    const props = feature.properties ?? {};
    const ctx = props.context ?? {};

    if (
      !name &&
      (props.feature_type === "poi" || props.feature_type === "place") &&
      props.name
    ) {
      setName(props.name);
    }

    setAddress(props.full_address ?? props.place_formatted ?? props.name ?? "");
    if (ctx.place?.name) setCity(ctx.place.name);
    if (ctx.region?.region_code) setState(ctx.region.region_code);
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setConfirmedAddress(
      props.full_address ?? props.place_formatted ?? `${lat}, ${lng}`,
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Latitude/longitude required.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const { data: meRow } = await supabase
      .from("players")
      .select("id")
      .eq("auth_user_id", userRes.user!.id)
      .maybeSingle();

    const { error: insertErr } = await supabase.from("courts").insert({
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim(),
      state: state.trim().toUpperCase(),
      country: "USA",
      latitude: lat,
      longitude: lng,
      type,
      status: "active",
      added_by: meRow?.id ?? null,
      owner_id: null,
      notes: notes.trim() || null,
    });

    if (insertErr) {
      setError(insertErr.message);
      setStatus("error");
      return;
    }

    setStatus("saved");
    router.push("/admin/courts");
    router.refresh();
  }

  const previewUrl =
    MAPBOX_TOKEN && latitude && longitude
      ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+99FF00(${longitude},${latitude})/${longitude},${latitude},14,0/600x250@2x?access_token=${MAPBOX_TOKEN}`
      : null;

  return (
    <form onSubmit={handleSave} className="mt-8 space-y-5">
      <Field label="Court name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="East Naples Pickleball Center"
          className={inputStyle}
        />
      </Field>

      <Field label="Search address or place">
        {!MAPBOX_TOKEN ? (
          <div className="rounded-lg border-2 border-bright bg-black p-4 text-base text-bright">
            ⚠ NEXT_PUBLIC_MAPBOX_TOKEN is not set in .env.local. Address
            autocomplete is disabled — fill the fields below manually.
          </div>
        ) : (
          <SearchBox
            accessToken={MAPBOX_TOKEN}
            value={searchValue}
            onChange={setSearchValue}
            onRetrieve={handleRetrieve}
            options={{
              language: "en",
              country: "us",
              types: "address,poi,place",
              limit: 6,
            }}
            placeholder="Type an address, court name, or place..."
            theme={{
              variables: {
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                unit: "16px",
                colorPrimary: "#99FF00",
                colorText: "#FFFFFF",
                colorTextSecondary: "rgba(255,255,255,0.6)",
                colorBackground: "#000000",
                colorBackgroundHover: "rgba(153,255,0,0.15)",
                colorBackgroundActive: "rgba(153,255,0,0.25)",
                colorBorder: "#FFFFFF",
                colorBorderHover: "#99FF00",
                borderRadius: "12px",
                boxShadow: "none",
                fontWeight: "400",
                lineHeight: "1.4",
              },
              cssText: `
                .Input, input[type="text"], input {
                  color: #FFFFFF !important;
                  background: #000000 !important;
                  caret-color: #99FF00 !important;
                  font-family: var(--font-sans), system-ui, sans-serif !important;
                  font-size: 16px !important;
                  border-radius: 12px !important;
                }
                .Input::placeholder, input::placeholder {
                  color: rgba(255,255,255,0.4) !important;
                }
                .ResultsAnchor, .Results {
                  background: #000000 !important;
                  color: #FFFFFF !important;
                  border: 2px solid #99FF00 !important;
                  border-radius: 12px !important;
                  margin-top: 4px !important;
                }
                .Suggestion {
                  color: #FFFFFF !important;
                  border-radius: 8px !important;
                }
                .Suggestion[aria-selected="true"], .Suggestion:hover {
                  background: rgba(153,255,0,0.18) !important;
                  color: #99FF00 !important;
                }
              `,
            }}
          />
        )}
        {confirmedAddress && (
          <p className="mt-2 text-base text-pickle">✓ {confirmedAddress}</p>
        )}
      </Field>

      {previewUrl && (
        <div className="overflow-hidden rounded-2xl border-2 border-pickle bg-black p-1 neon-pickle">
          <img
            src={previewUrl}
            alt="Map preview"
            width={600}
            height={250}
            className="block h-auto w-full rounded-xl"
          />
        </div>
      )}

      <Field label="Address (free-form)">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={240}
          placeholder="Street, city, state ZIP"
          className={inputStyle}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            className={inputStyle}
          />
        </Field>
        <Field label="State">
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
            maxLength={2}
            className={`${inputStyle} uppercase`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <input
            type="text"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            required
            placeholder="26.122400"
            className={`${inputStyle} font-mono`}
          />
        </Field>
        <Field label="Longitude">
          <input
            type="text"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            required
            placeholder="-81.768900"
            className={`${inputStyle} font-mono`}
          />
        </Field>
      </div>

      <Field label="Type">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-base text-white">
            <input
              type="radio"
              name="type"
              value="public"
              checked={type === "public"}
              onChange={() => setType("public")}
              className="accent-pickle"
            />
            Public (free)
          </label>
          <label className="flex items-center gap-2 text-base text-white">
            <input
              type="radio"
              name="type"
              value="private"
              checked={type === "private"}
              onChange={() => setType("private")}
              className="accent-electric"
            />
            Private (paid)
          </label>
        </div>
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputStyle}
          placeholder="Internal admin note"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="soft-stamp rounded-xl bg-pickle px-6 py-3 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Save court"}
        </button>
        {error && <span className="text-base text-bright">⚠ {error}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
