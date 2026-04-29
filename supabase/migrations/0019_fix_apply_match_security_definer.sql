-- =============================================================
-- 0019 — make apply_match_to_stats() run as SECURITY DEFINER
-- =============================================================
-- The trigger function written in migration 0001 inserts into
-- public.events when a match flips to 'vouched'. The events table
-- has no INSERT policy (the design assumed triggers would run as
-- security definer), but the function was missing that clause.
--
-- Result: admin "Force vouch" failed with:
--   new row violates row-level security policy for table "events"
--
-- Fix: re-declare the function with security definer + a fixed
-- search_path so the events insert bypasses RLS.
-- =============================================================

create or replace function public.apply_match_to_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    values (
      new.logged_by,
      'match_vouched',
      jsonb_build_object(
        'match_id', new.id,
        'server_score', new.server_score,
        'receiver_score', new.receiver_score
      )
    );
  end if;

  return new;
end;
$$;

-- =============================================================
-- DONE.
-- =============================================================
