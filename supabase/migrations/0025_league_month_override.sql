-- =============================================================
-- 0025 — league month override (start a month early/late)
-- =============================================================
-- Lets the admin start the next month's league ahead of schedule by
-- setting a global override. While the override is set:
--   • New matches get tagged with the override month (regardless of
--     played_at).
--   • The ladder page defaults to that month.
--   • Existing matches keep their original league month.
--
-- When the override is null, everything works on calendar months.
-- Set the override to e.g. '2026-05' to start May early. Clear it
-- (set to null) to fall back to calendar months.
-- =============================================================

-- 1. app_settings table — generic key/value store for site-wide config
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings public read" on public.app_settings;
create policy "app_settings public read"
  on public.app_settings for select
  using (true);

drop policy if exists "app_settings admin write" on public.app_settings;
create policy "app_settings admin write"
  on public.app_settings for all
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- Seed the override key (NULL by default — calendar months apply)
insert into public.app_settings (key, value)
values ('league_month_override', null)
on conflict (key) do nothing;

-- 2. Helper: current league month key
create or replace function public.current_league_month_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'league_month_override'),
    to_char(now() at time zone 'UTC', 'YYYY-MM')
  );
$$;

grant execute on function public.current_league_month_key() to anon, authenticated;

-- 3. league_month_key column on matches
alter table public.matches
  add column if not exists league_month_key text;

-- Backfill from played_at (UTC)
update public.matches
set league_month_key = to_char(played_at at time zone 'UTC', 'YYYY-MM')
where league_month_key is null;

alter table public.matches
  alter column league_month_key set not null;

create index if not exists matches_league_month_idx
  on public.matches(league_month_key);

-- 4. Trigger: on insert, set league_month_key from override or played_at
create or replace function public.matches_set_league_month_key()
returns trigger
language plpgsql
as $$
begin
  if new.league_month_key is null then
    new.league_month_key := public.current_league_month_key();
  end if;
  return new;
end;
$$;

drop trigger if exists matches_league_month_trigger on public.matches;
create trigger matches_league_month_trigger
  before insert on public.matches
  for each row execute function public.matches_set_league_month_key();

-- 5. Update city_monthly_ladder() to filter by league_month_key instead
--    of date range. This way, an override-tagged April 30 match will
--    correctly show on May's ladder.
drop function if exists public.city_monthly_ladder(text, text, text);

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
  weighted_wins numeric,
  win_rate numeric,
  score numeric,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with city_matches as (
    select
      m.id,
      m.server_team_p1, m.server_team_p2,
      m.receiver_team_p1, m.receiver_team_p2,
      m.server_score, m.receiver_score,
      coalesce(sp1.dupr_self_rating, 3.5) as sp1_rating,
      coalesce(sp2.dupr_self_rating, 3.5) as sp2_rating,
      coalesce(rp1.dupr_self_rating, 3.5) as rp1_rating,
      coalesce(rp2.dupr_self_rating, 3.5) as rp2_rating
    from public.matches m
    join public.courts c on c.id = m.court_id
    join public.players sp1 on sp1.id = m.server_team_p1
    join public.players sp2 on sp2.id = m.server_team_p2
    join public.players rp1 on rp1.id = m.receiver_team_p1
    join public.players rp2 on rp2.id = m.receiver_team_p2
    where m.status = 'vouched'
      and m.league_month_key = p_month_key
      and lower(c.city) = lower(p_city)
      and lower(c.state) = lower(p_state)
  ),
  match_weights as (
    select
      *,
      ((sp1_rating + sp2_rating) / 2.0) as server_team_avg,
      ((rp1_rating + rp2_rating) / 2.0) as receiver_team_avg,
      (server_score > receiver_score) as server_won
    from city_matches
  ),
  player_results as (
    select
      server_team_p1 as pid,
      server_won as won,
      case when server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (receiver_team_avg - server_team_avg)))
        else 0
      end as match_value
    from match_weights
    union all
    select server_team_p2, server_won,
      case when server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (receiver_team_avg - server_team_avg)))
        else 0
      end
    from match_weights
    union all
    select receiver_team_p1, (not server_won),
      case when not server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (server_team_avg - receiver_team_avg)))
        else 0
      end
    from match_weights
    union all
    select receiver_team_p2, (not server_won),
      case when not server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (server_team_avg - receiver_team_avg)))
        else 0
      end
    from match_weights
  ),
  agg as (
    select
      pid,
      count(*) as matches_played,
      count(*) filter (where won) as wins,
      count(*) filter (where not won) as losses,
      sum(match_value)::numeric as weighted_wins
    from player_results
    group by pid
  ),
  scored as (
    select
      a.pid,
      a.matches_played,
      a.wins,
      a.losses,
      round(a.weighted_wins, 2) as weighted_wins,
      case when a.matches_played > 0
        then round(a.wins::numeric / a.matches_played, 4)
        else 0
      end as win_rate,
      case when a.matches_played > 0
        then round(a.weighted_wins * (a.wins::numeric / a.matches_played), 2)
        else 0
      end as score
    from agg a
  )
  select
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.avatar_focal_x,
    p.avatar_focal_y,
    s.matches_played,
    s.wins,
    s.losses,
    s.weighted_wins,
    s.win_rate,
    s.score,
    row_number() over (
      order by s.score desc, s.weighted_wins desc, s.wins desc, s.matches_played desc
    ) as rank
  from scored s
  join public.players p on p.id = s.pid
  where coalesce(p.is_guest, false) = false
  order by s.score desc, s.weighted_wins desc, s.wins desc, s.matches_played desc;
$$;

grant execute on function public.city_monthly_ladder(text, text, text) to anon, authenticated;

-- 6. SET THE OVERRIDE TO '2026-05' so the May league starts now.
--    Calvin can clear this later by setting value to NULL.
update public.app_settings
set value = '2026-05', updated_at = now()
where key = 'league_month_override';

-- =============================================================
-- DONE.
-- =============================================================
