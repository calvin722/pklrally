-- =============================================================
-- 0022 — three sponsor slots + separate prizes table
-- =============================================================
-- Two structural changes for the monthly ladder page:
--
-- 1. SPONSORS — sponsorships now have a `slot` column (1, 2, or 3),
--    so each city + month can have up to three active sponsors. The
--    unique constraint becomes (city, state, month_key, slot).
--
-- 2. PRIZES — prizes are no longer attached to a sponsor row. They
--    live in a new `ladder_prizes` table keyed by (city, state, month,
--    place 1/2/3). A prize can have a title, description, and image.
--
-- The prize_* columns on `sponsorships` are NOT dropped — they're
-- left in place as deprecated for now. Page rendering reads from
-- `ladder_prizes` going forward.
-- =============================================================

-- 1. Sponsor slots
alter table public.sponsorships
  add column if not exists slot int not null default 1
    check (slot in (1, 2, 3));

-- Replace the city/month unique index with one that includes slot
drop index if exists public.sponsorships_city_month_unique;

create unique index if not exists sponsorships_city_month_slot_unique
  on public.sponsorships (lower(city), lower(state), month_key, slot)
  where status = 'active';

-- 2. Ladder prizes table
create table if not exists public.ladder_prizes (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text not null,
  month_key text not null,
  place int not null check (place in (1, 2, 3)),
  title text,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Postgres doesn't allow function expressions in inline UNIQUE constraints,
-- so the case-insensitive uniqueness goes in a separate CREATE UNIQUE INDEX.
create unique index if not exists ladder_prizes_city_month_place_unique
  on public.ladder_prizes (lower(city), lower(state), month_key, place);

create index if not exists ladder_prizes_lookup_idx
  on public.ladder_prizes (lower(state), lower(city), month_key);

-- RLS: public read, admin write
alter table public.ladder_prizes enable row level security;

drop policy if exists "ladder_prizes public read" on public.ladder_prizes;
create policy "ladder_prizes public read"
  on public.ladder_prizes for select
  using (true);

drop policy if exists "ladder_prizes admin write" on public.ladder_prizes;
create policy "ladder_prizes admin write"
  on public.ladder_prizes for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- =============================================================
-- DONE.
-- =============================================================
