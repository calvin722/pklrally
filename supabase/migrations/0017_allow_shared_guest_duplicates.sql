-- =============================================================
-- 0017 — allow the shared "Guest" placeholder to fill multiple slots
-- =============================================================
-- The original schema had a strict CHECK constraint:
--
--   matches_no_dup_players: no player_id can appear twice in a match
--
-- That made sense before migration 0014 introduced the SHARED Guest
-- placeholder row. Now, anyone typing "guest" / "anon" / "?" for multiple
-- slots resolves to the same player_id, and the CHECK rejects the insert.
--
-- We still want to prevent REAL players from being duplicated (a member
-- can't be on both teams). So we replace the CHECK with a trigger that
-- runs the same check but exempts unclaimed guests (no email, no auth).
-- The shared "Guest" placeholder is the only such row in practice — any
-- real guest with an email gets its own row, so the rule still bites
-- where it should.
-- =============================================================

alter table public.matches
  drop constraint if exists matches_no_dup_players;

create or replace function public.matches_check_no_dup_players()
returns trigger
language plpgsql
as $$
declare
  ids uuid[] := array[
    new.server_team_p1, new.server_team_p2,
    new.receiver_team_p1, new.receiver_team_p2
  ];
  dup_id uuid;
  is_shared_placeholder boolean;
begin
  -- Find any player_id that appears more than once across the 4 slots.
  select id into dup_id
  from unnest(ids) as id
  group by id
  having count(*) > 1
  limit 1;

  -- No duplicates → all good.
  if dup_id is null then
    return new;
  end if;

  -- Duplicates are allowed only if the duplicated row is the shared
  -- guest placeholder: a guest with no email and no auth_user_id.
  select (is_guest = true
            and email is null
            and auth_user_id is null)
    into is_shared_placeholder
  from public.players
  where id = dup_id;

  if coalesce(is_shared_placeholder, false) then
    return new;
  end if;

  raise exception 'Same player cannot appear twice in a match (player_id: %)', dup_id
    using errcode = '23514';
end;
$$;

drop trigger if exists matches_no_dup_players_trigger on public.matches;
create trigger matches_no_dup_players_trigger
  before insert or update on public.matches
  for each row
  execute function public.matches_check_no_dup_players();

-- =============================================================
-- DONE.
-- =============================================================
