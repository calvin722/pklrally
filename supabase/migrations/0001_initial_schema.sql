-- =============================================================
-- PKLRALLY — Phase 2 initial schema
-- =============================================================
-- Run this in Supabase Dashboard → SQL Editor (paste, click RUN).
-- Idempotent-ish: drops are commented out so you don't nuke prod data
-- by accident, but you can uncomment to re-run cleanly during dev.
--
-- After running, in Supabase Dashboard → Authentication → URL Configuration:
--   Site URL:  http://localhost:3000  (later: https://pklrally.com)
--   Redirect URLs: add http://localhost:3000/auth/callback
--                  and  https://pklrally.com/auth/callback
-- =============================================================

-- Useful extensions
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive emails

-- -----------------------------------------------------------------
-- PLAYERS — unified table for real members and guests
-- -----------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,

  display_name text not null,
  email citext,
  phone text,
  avatar_url text,
  city text,
  state text,

  -- Self-rated DUPR, 2.0–8.0 in 0.5 steps (enforced in app + check here)
  dupr_self_rating numeric(3,1)
    check (dupr_self_rating is null or (dupr_self_rating between 2.0 and 8.0)),

  is_admin boolean not null default false,
  is_guest boolean not null default false,

  -- Guest-specific
  invite_token text unique,
  invite_token_expires_at timestamptz,
  claimed_at timestamptz,

  -- Denormalized lifetime stats (updated via trigger on match vouch)
  matches_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  points_scored int not null default 0,
  points_against int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists players_auth_user_id_idx on public.players(auth_user_id);
create index if not exists players_email_idx on public.players(email);
create index if not exists players_is_admin_idx on public.players(is_admin) where is_admin = true;
create index if not exists players_city_state_idx on public.players(city, state);

-- -----------------------------------------------------------------
-- COURTS — physical pickleball courts
-- -----------------------------------------------------------------
create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  address text,
  city text not null,
  state text not null,
  country text not null default 'USA',

  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,

  type text not null check (type in ('public','private')) default 'public',
  status text not null check (status in ('active','pending_review','payment_required','inactive'))
    default 'active',

  owner_id uuid references public.players(id) on delete set null,
  added_by uuid references public.players(id) on delete set null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courts_lat_lng_idx on public.courts(latitude, longitude);
create index if not exists courts_city_state_idx on public.courts(city, state);
create index if not exists courts_status_type_idx on public.courts(status, type);

-- -----------------------------------------------------------------
-- MATCHES — recorded doubles matches
-- -----------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),

  court_id uuid not null references public.courts(id) on delete restrict,
  logged_by uuid not null references public.players(id) on delete set null,

  -- Doubles only for V1 — 4 player slots
  -- s1 is the active server (top-left of serving side)
  server_team_p1 uuid not null references public.players(id) on delete restrict,
  server_team_p2 uuid not null references public.players(id) on delete restrict,
  receiver_team_p1 uuid not null references public.players(id) on delete restrict,
  receiver_team_p2 uuid not null references public.players(id) on delete restrict,

  server_score int not null check (server_score >= 0),
  receiver_score int not null check (receiver_score >= 0),

  status text not null check (status in
    ('pending','vouched','disputed','unverified_all_guest','admin_deleted'))
    default 'pending',

  played_at timestamptz not null default now(),
  vouched_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Sanity: same player can't appear twice in the same match
  constraint matches_no_dup_players check (
    server_team_p1 <> server_team_p2
    and receiver_team_p1 <> receiver_team_p2
    and server_team_p1 not in (receiver_team_p1, receiver_team_p2)
    and server_team_p2 not in (receiver_team_p1, receiver_team_p2)
  )
);

create index if not exists matches_court_played_idx on public.matches(court_id, played_at desc);
create index if not exists matches_status_idx on public.matches(status);
create index if not exists matches_logged_by_idx on public.matches(logged_by);
create index if not exists matches_played_at_idx on public.matches(played_at desc);

-- -----------------------------------------------------------------
-- VOUCHES — opponents confirm or dispute
-- -----------------------------------------------------------------
create table if not exists public.vouches (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  action text not null check (action in ('vouched','disputed')),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists vouches_match_idx on public.vouches(match_id);
create index if not exists vouches_player_idx on public.vouches(player_id);

-- -----------------------------------------------------------------
-- TROPHIES — monthly per-court awards (gold/silver/bronze)
-- -----------------------------------------------------------------
create table if not exists public.trophies (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  month_key text not null,                 -- YYYY-MM
  place smallint not null check (place between 1 and 3),
  wins int not null,
  losses int not null,
  awarded_at timestamptz not null default now(),
  unique (player_id, court_id, month_key, place)
);

create index if not exists trophies_player_idx on public.trophies(player_id);
create index if not exists trophies_court_month_idx on public.trophies(court_id, month_key);

-- -----------------------------------------------------------------
-- EVENTS — analytics log (admin dashboard reads from this)
-- -----------------------------------------------------------------
create table if not exists public.events (
  id bigserial primary key,
  player_id uuid references public.players(id) on delete set null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_created_idx on public.events(created_at desc);
create index if not exists events_type_created_idx on public.events(event_type, created_at desc);
create index if not exists events_player_idx on public.events(player_id);

-- =============================================================
-- TRIGGERS
-- =============================================================

-- Generic updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch on public.players;
create trigger players_touch before update on public.players
  for each row execute function public.touch_updated_at();

drop trigger if exists courts_touch on public.courts;
create trigger courts_touch before update on public.courts
  for each row execute function public.touch_updated_at();

drop trigger if exists matches_touch on public.matches;
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

-- Auto-create a player row when someone signs up via Supabase Auth
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  guess_name text;
  existing_player uuid;
begin
  -- Try to claim a guest row first (matched by email)
  select id into existing_player
  from public.players
  where email = new.email::citext
    and is_guest = true
    and auth_user_id is null
  limit 1;

  if existing_player is not null then
    update public.players
       set auth_user_id = new.id,
           is_guest = false,
           claimed_at = now(),
           invite_token = null,
           invite_token_expires_at = null
     where id = existing_player;

    insert into public.events (player_id, event_type, payload)
    values (existing_player, 'guest_claimed', jsonb_build_object('email', new.email));

    return new;
  end if;

  -- No guest match — create a fresh player
  guess_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.players (auth_user_id, email, display_name)
  values (new.id, new.email::citext, guess_name);

  insert into public.events (player_id, event_type, payload)
  values (
    (select id from public.players where auth_user_id = new.id),
    'signup',
    jsonb_build_object('email', new.email)
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Update player lifetime stats when a match flips to 'vouched'
create or replace function public.apply_match_to_stats()
returns trigger language plpgsql as $$
declare
  server_won boolean;
  s1 uuid := new.server_team_p1;
  s2 uuid := new.server_team_p2;
  r1 uuid := new.receiver_team_p1;
  r2 uuid := new.receiver_team_p2;
begin
  -- Only fire when status actually transitions into 'vouched'
  if (tg_op = 'UPDATE' and new.status = 'vouched' and old.status is distinct from 'vouched') then
    server_won := new.server_score > new.receiver_score;

    update public.players set
      matches_played = matches_played + 1,
      wins   = wins   + case when server_won then 1 else 0 end,
      losses = losses + case when server_won then 0 else 1 end,
      points_scored  = points_scored  + new.server_score,
      points_against = points_against + new.receiver_score
    where id in (s1, s2);

    update public.players set
      matches_played = matches_played + 1,
      wins   = wins   + case when server_won then 0 else 1 end,
      losses = losses + case when server_won then 1 else 0 end,
      points_scored  = points_scored  + new.receiver_score,
      points_against = points_against + new.server_score
    where id in (r1, r2);

    insert into public.events (player_id, event_type, payload)
    values (new.logged_by, 'match_vouched',
            jsonb_build_object('match_id', new.id, 'court_id', new.court_id));
  end if;

  return new;
end;
$$;

drop trigger if exists matches_apply_stats on public.matches;
create trigger matches_apply_stats
  after update on public.matches
  for each row execute function public.apply_match_to_stats();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table public.players  enable row level security;
alter table public.courts   enable row level security;
alter table public.matches  enable row level security;
alter table public.vouches  enable row level security;
alter table public.trophies enable row level security;
alter table public.events   enable row level security;

-- ------ players ------
drop policy if exists "players read all" on public.players;
create policy "players read all" on public.players
  for select using (true);   -- profiles are public

drop policy if exists "players update self" on public.players;
create policy "players update self" on public.players
  for update using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists "players admin all" on public.players;
create policy "players admin all" on public.players
  for all using (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.is_admin = true)
  );

-- ------ courts ------
drop policy if exists "courts read active" on public.courts;
create policy "courts read active" on public.courts
  for select using (status = 'active');

drop policy if exists "courts admin write" on public.courts;
create policy "courts admin write" on public.courts
  for all using (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.is_admin = true)
  );

-- ------ matches ------
drop policy if exists "matches read vouched" on public.matches;
create policy "matches read vouched" on public.matches
  for select using (status = 'vouched' or status = 'unverified_all_guest');

drop policy if exists "matches read participant" on public.matches;
create policy "matches read participant" on public.matches
  for select using (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid()
              and p.id in (logged_by, server_team_p1, server_team_p2, receiver_team_p1, receiver_team_p2))
  );

drop policy if exists "matches insert by participant" on public.matches;
create policy "matches insert by participant" on public.matches
  for insert with check (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.id = logged_by)
  );

drop policy if exists "matches admin all" on public.matches;
create policy "matches admin all" on public.matches
  for all using (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.is_admin = true)
  );

-- ------ vouches ------
drop policy if exists "vouches read participant" on public.vouches;
create policy "vouches read participant" on public.vouches
  for select using (true);  -- vouch trail is public on a vouched match

drop policy if exists "vouches insert by opponent" on public.vouches;
create policy "vouches insert by opponent" on public.vouches
  for insert with check (
    exists (
      select 1
      from public.matches m
      join public.players p on p.auth_user_id = auth.uid()
      where m.id = match_id
        and player_id = p.id
        -- voucher must be a member opponent (not the logger)
        and p.id <> m.logged_by
        and p.id in (m.server_team_p1, m.server_team_p2, m.receiver_team_p1, m.receiver_team_p2)
        and p.is_guest = false
    )
  );

-- ------ trophies ------
drop policy if exists "trophies read all" on public.trophies;
create policy "trophies read all" on public.trophies
  for select using (true);

-- (Inserts/deletes handled by service-role cron job — no policy needed,
--  service role bypasses RLS entirely.)

-- ------ events ------
drop policy if exists "events admin read" on public.events;
create policy "events admin read" on public.events
  for select using (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.is_admin = true)
  );

-- (Inserts handled by triggers running as security definer or by service role.)

-- =============================================================
-- DONE.
-- =============================================================
