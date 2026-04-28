# PKLRALLY — pklrally.com

PKL is green, RALLY is yellow. Wordmark in the header is a placeholder until the proper logo lands.

The live pulse of pickleball. A 2-bit retro-arcade web app for logging matches, tracking stats, and watching your city light up.

## What's in this scaffold (Phase 1)

- Next.js 15 App Router + TypeScript + Tailwind 3
- 4-color 2-bit design system: Pickleball Green (`#99FF00`), Electric Blue (`#00BFFF`), Bright Yellow (`#FFFF00`), White, on a black arcade background
- Pixel fonts (Press Start 2P, VT323) loaded from Google Fonts
- Pixel-border, pixel-stamp, dithering, scanline, and grid-bg utility classes
- The buzzing US "live pulse" map — `react-simple-maps` with mock city data and a CSS keyframe glow on cities with matches in the last 60 minutes
- Floating START RALLY button (no-op for now — Phase 4 wires the scoring flow)
- City detail panel that opens when you tap a buzzing dot (placeholder timeline)

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

You should see the dark arcade map with several green dots — Naples, Denver, Austin, Phoenix, NYC, Miami, and Atlanta will be pulsing. Tap any city to open its detail panel.

## File map

```
app/
  layout.tsx          # Root layout, viewport, fonts wired
  page.tsx            # Homepage — header + map + Start Rally + city panel
  globals.css         # Tailwind + custom pixel utilities + keyframes
components/
  USMap.tsx           # The interactive US map (client-only)
  StartRallyButton.tsx
lib/
  types.ts            # Court / CityNode types — will mirror Supabase rows
  mockCourts.ts       # Mock cities; replaced by Supabase queries in Phase 3
tailwind.config.ts    # 4-color palette + pixel grid + buzz/flicker keyframes
```

## Phase 2 setup — one-time

After pulling Phase 2 changes, three things to do before `npm run dev`:

### 1. Install new deps

```bash
npm install
```

This pulls in `@supabase/ssr` and `@supabase/supabase-js`.

### 2. Run the database migration

Open Supabase Dashboard → **SQL Editor** → New Query → paste the entire contents of `supabase/migrations/0001_initial_schema.sql` → click **RUN**.

You should see "Success. No rows returned." This creates: `players`, `courts`, `matches`, `vouches`, `trophies`, `events` tables, plus triggers (auto-create player on signup, update stats on match vouch) and RLS policies.

### 3. Configure auth redirect URLs

Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs** (Add URL): `http://localhost:3000/auth/callback`

When we deploy to pklrally.com, add `https://pklrally.com/auth/callback` to the Redirect URLs list as well — keep `localhost` in there for ongoing dev.

### 4. Test sign-in

```bash
npm run dev
```

Visit http://localhost:3000/login → enter your email → check inbox → click the magic link → you'll land back on the homepage signed in. Click your name in the header → MY PROFILE → set your DUPR rating and city.

## Phase 3a setup — one migration

Open Supabase SQL Editor → New Query → paste contents of `supabase/migrations/0004_seed_courts_and_admin.sql` → RUN.

This (a) flips Calvin to admin, (b) seeds 13 real public courts with real lat/lng so the map has live data, (c) creates the `city_court_pulse` view that the map queries.

After running, refresh `http://localhost:3000/`. The map's now live (same dots from Supabase, no more mock data). Click your name top-right and you'll see a new bright-yellow **⚙ ADMIN** option in the dropdown — that opens the admin shell at `/admin`.

## Roadmap

Phase 1 — design system + buzzing map  ✓
Phase 2 — Supabase wiring, magic-link auth, profiles  ✓
Phase 3a — real courts + admin courts CRUD + geocoding  ✓
Phase 3b — TOTP MFA on /admin, players admin, matches admin, dashboard charts
Phase 4 — Start Rally flow, 2D pixel court, score entry
Phase 5 — vouch system, local timelines, realtime notifications, Resend email
Phase 6 — monthly ladders, trophies, profile trophy room, pixel rating
Phase 7 — polish, custom domain, beta launch
