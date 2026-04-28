"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const inputStyle =
  "w-full rounded-lg border-2 border-white bg-black px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-pickle focus:outline-none";

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

interface SuggestCourtFormProps {
  playerId: string;
}

type Status = "idle" | "saving" | "submitted" | "error";

export default function SuggestCourtForm({ playerId }: SuggestCourtFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [notes, setNotes] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
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
      setError("Please pick the address from the search to fill coordinates.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    const { error: insertErr } = await supabase.from("courts").insert({
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim(),
      state: state.trim().toUpperCase(),
      country: "USA",
      latitude: lat,
      longitude: lng,
      type: "public",
      status: "pending_review",
      added_by: playerId,
      owner_id: null,
      notes: notes.trim() || null,
    });

    if (insertErr) {
      setError(insertErr.message);
      setStatus("error");
      return;
    }

    setStatus("submitted");
    router.refresh();
  }

  if (status === "submitted") {
    return (
      <div className="rounded-2xl border-2 border-pickle bg-black p-6 neon-pickle">
        <h2 className="font-display text-display-lg font-extrabold text-pickle">
          ✓ Court submitted
        </h2>
        <p className="mt-2 text-base text-white/80 leading-relaxed">
          Thanks! We'll review and add it to the map within 24 hours. You'll see
          it with a green dot once it's live.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              // Reset for another submission
              setName("");
              setAddress("");
              setCity("");
              setState("");
              setLatitude("");
              setLongitude("");
              setNotes("");
              setSearchValue("");
              setConfirmedAddress(null);
              setStatus("idle");
              setError(null);
            }}
            className="rounded-lg border-2 border-pickle px-4 py-2 font-display text-display-xs uppercase font-semibold tracking-wide text-pickle hover:bg-pickle hover:text-black"
          >
            Suggest another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
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

      <Field label="Search address or place name">
        {!MAPBOX_TOKEN ? (
          <div className="rounded-lg border-2 border-bright bg-black p-4 text-base text-bright">
            ⚠ Mapbox isn't configured. Contact admin.
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
            placeholder="Type the court's address or name..."
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

      <Field label="Anything we should know? (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="e.g. # of courts, indoor/outdoor, hours, parking..."
          className={inputStyle}
        />
      </Field>

      <p className="text-xs text-white/50 leading-relaxed">
        Public courts are free for everyone to log matches at. Private clubs and
        venues with paid memberships use a separate portal — contact us at
        admin@pklrally.com if you run a private facility.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="soft-stamp rounded-xl bg-pickle px-6 py-3 font-display text-display-base font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
        >
          {status === "saving" ? "Submitting..." : "Submit for review"}
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
