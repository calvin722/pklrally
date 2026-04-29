-- =============================================================
-- 0015 — sponsors, monthly sponsorships, and city ladder function
-- =============================================================
-- Adds support for the monthly ladder feature:
--   1. sponsors        — businesses that can sponsor a city ladder
--   2. sponsorships    — month-by-month sponsorship of a specific city
--   3. city_monthly_ladder() — Postgres function returning ranked players
--      for a given city + month using the score = wins * (wins/matches)
--      formula. This rewards both skill (win rate) and engagement (wins),
--      while preventing someone from gaming by playing tons of low-quality
--      matches: a player with 100 wins out of 200 matches scores
--      100 * 0.5 = 50, while a player with 30 wins out of 35 matches
--      scores 30 * 0.857 = ~25.7. The first player still wins, but win
--      rate matters significantly.
--
-- Phase 1 (now): admin manually creates sponsors + sponsorships.
-- Phase 2 (later): self-serve sponsor portal + Stripe subscription.
-- =============================================================

-- -------------------------------------------------------------
-- sponsors: businesses we know about. Reusable across months.
-- -------------------------------------------------------------
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  website text,
  contact_email text,
  short_description text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- sponsorships: a sponsor's claim on a city ladder for a given month.
-- month_key is YYYY-MM in UTC for display + lookup simplicity.
-- One sponsor can sponsor multiple cities; multiple sponsors *could*
-- in theory share a city, but for v1 we'll enforce one active per
-- (city, state, month) — admin discretion via the unique constraint.
-- -------------------------------------------------------------
create table if not exists public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  city text not null,
  state text not null,
  month_key text not null,
  prize_1_title text,
  prize_1_description text,
  prize_2_title text,
  prize_2_description text,
  prize_3_title text,
  prize_3_description text,
  prize_image_url text,
  status text not null default 'active',
  amount_paid_cents integer,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- One active sponsorship per city+month (Phase 1 simplification)
create unique index if not exists sponsorships_city_month_unique
  on public.sponsorships (lower(city), lower(state), month_key)
  where status = 'active';

-- Lookup index for city/state/month queries
create index if not exists sponsorships_lookup_idx
  on public.sponsorships (lower(state), lower(city), month_key);

-- -------------------------------------------------------------
-- RLS: public can read, only admins can write.
-- -------------------------------------------------------------
alter table public.sponsors enable row level security;
alter table public.sponsorships enable row level security;

drop policy if exists "sponsors public read" on public.sponsors;
create policy "sponsors public read"
  on public.sponsors for select
  using (true);

drop policy if exists "sponsors admin write" on public.sponsors;
create policy "sponsors admin write"
  on public.sponsors for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "sponsorships public read" on public.sponsorships;
create policy "sponsorships public read"
  on public.sponsorships for select
  using (true);

drop policy if exists "sponsorships admin write" on public.sponsorships;
create policy "sponsorships admin write"
  on public.sponsorships for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- -------------------------------------------------------------
-- city_monthly_ladder()
--
-- Returns ranked players for the given city + state + month. Pulls
-- vouched matches at courts in the city, unions all 4 player slots,
-- aggregates W/L per player, and computes:
--   score = wins * (wins::numeric / nullif(matches_played, 0))
--         = wins^2 / matches
--
-- Excludes guests (is_guest = true) from the ladder — guests can't
-- be ranked because they haven't claimed an account yet.
--
-- month_key format: 'YYYY-MM' (UTC).
-- -------------------------------------------------------------
create or replace function public.city_monthly_ladder(
  p_city text,
  p_state text,
  p_month_key text
)
returns table (
  player_id uuid,
  display_name text,
  username text,
  avatar_url text,
  avatar_focal_x numeric,
  avatar_focal_y numeric,
  matches_played bigint,
  wins bigint,
  losses bigint,
  win_rate numeric,
  score numeric,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with month_bounds as (
    select
      ((p_month_key || '-01')::timestamp at time zone 'UTC') as start_at,
      (((p_month_key || '-01')::timestamp + interval '1 month')
        at time zone 'UTC') as end_at
  ),
  city_matches as (
    select m.*
    from public.matches m
    join public.courts c on c.id = m.court_id
    cross join month_bounds mb
    where m.status = 'vouched'
      and lower(c.city) = lower(p_city)
      and lower(c.state) = lower(p_state)
      and m.played_at >= mb.start_at
      and m.played_at < mb.end_at
  ),
  -- Each match contributes 4 rows (one per player slot), with a
  -- "won" boolean indicating whether that slot's team won.
  player_results as (
    select server_team_p1 as pid,
           (server_score > receiver_score) as won
    from city_matches
    union all
    select server_team_p2 as pid,
           (server_score > receiver_score) as won
    from city_matches
    union all
    select receiver_team_p1 as pid,
           (receiver_score > server_score) as won
    from city_matches
    union all
    select receiver_team_p2 as pid,
           (receiver_score > server_score) as won
    from city_matches
  ),
  agg as (
    select
      pid,
      count(*) as matches_played,
      count(*) filter (where won) as wins,
      count(*) filter (where not won) as losses
    from player_results
    group by pid
  ),
  scored as (
    select
      a.pid,
      a.matches_played,
      a.wins,
      a.losses,
      case when a.matches_played > 0
        then round(a.wins::numeric / a.matches_played, 4)
        else 0
      end as win_rate,
      case when a.matches_played > 0
        then round((a.wins::numeric * a.wins::numeric) / a.matches_played, 2)
        else 0
      end as score
    from agg a
  )
  select
    p.id as player_id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.avatar_focal_x,
    p.avatar_focal_y,
    s.matches_played,
    s.wins,
    s.losses,
    s.win_rate,
    s.score,
    row_number() over (order by s.score desc, s.wins desc, s.matches_played desc) as rank
  from scored s
  join public.players p on p.id = s.pid
  where coalesce(p.is_guest, false) = false
  order by s.score desc, s.wins desc, s.matches_played desc;
$$;

grant execute on function public.city_monthly_ladder(text, text, text) to anon, authenticated;

-- =============================================================
-- DONE.
-- =============================================================
