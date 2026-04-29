-- =============================================================
-- 0016 — weight ladder wins by team-vs-team rating gap
-- =============================================================
-- Replaces the city_monthly_ladder() function. The formula evolves from:
--
--   score = wins * (wins / matches_played)
--
-- to:
--
--   match_value = clamp(0.5, 1.5, 1 + 0.3 * (opp_team_avg - your_team_avg))
--   weighted_wins = sum of match_value across wins
--   score         = weighted_wins * (wins / matches_played)
--
-- This closes two loopholes:
--   1) Volume farming — handled already by win_rate (still here)
--   2) Beating up on lower-rated players — each win against a weaker
--      team is now discounted (down to 0.5×). Wins against stronger
--      teams are amplified (up to 1.5×).
--
-- Doubles math: both teammates get the SAME multiplier, computed from
-- the gap between team-average ratings. So a 4.0 + 3.0 team beating
-- two 3.5s averages to a fair 3.5 vs 3.5 fight (multiplier = 1.0).
--
-- Unrated players default to 3.5 (rec median) so guests + new accounts
-- don't poison the math.
-- =============================================================

-- Return shape changed (added weighted_wins), so Postgres requires a DROP
-- before recreating. CREATE OR REPLACE only allows body changes, not
-- signature changes.
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
  with month_bounds as (
    select
      ((p_month_key || '-01')::timestamp at time zone 'UTC') as start_at,
      (((p_month_key || '-01')::timestamp + interval '1 month')
        at time zone 'UTC') as end_at
  ),
  city_matches as (
    select
      m.id,
      m.server_team_p1,
      m.server_team_p2,
      m.receiver_team_p1,
      m.receiver_team_p2,
      m.server_score,
      m.receiver_score,
      -- Each player's self-rating; null/missing → 3.5 (rec median)
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
    cross join month_bounds mb
    where m.status = 'vouched'
      and lower(c.city) = lower(p_city)
      and lower(c.state) = lower(p_state)
      and m.played_at >= mb.start_at
      and m.played_at < mb.end_at
  ),
  -- Per-match team averages + winner flag
  match_weights as (
    select
      *,
      ((sp1_rating + sp2_rating) / 2.0) as server_team_avg,
      ((rp1_rating + rp2_rating) / 2.0) as receiver_team_avg,
      (server_score > receiver_score) as server_won
    from city_matches
  ),
  -- Each match contributes 4 rows — one per slot. match_value is the
  -- weighted credit for THIS slot for THIS match (0 if they lost).
  player_results as (
    -- Server team P1
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
    -- Server team P2
    select
      server_team_p2 as pid,
      server_won as won,
      case when server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (receiver_team_avg - server_team_avg)))
        else 0
      end as match_value
    from match_weights
    union all
    -- Receiver team P1
    select
      receiver_team_p1 as pid,
      (not server_won) as won,
      case when not server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (server_team_avg - receiver_team_avg)))
        else 0
      end as match_value
    from match_weights
    union all
    -- Receiver team P2
    select
      receiver_team_p2 as pid,
      (not server_won) as won,
      case when not server_won
        then greatest(0.5, least(1.5,
          1 + 0.3 * (server_team_avg - receiver_team_avg)))
        else 0
      end as match_value
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
    p.id as player_id,
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

-- =============================================================
-- DONE.
-- =============================================================
