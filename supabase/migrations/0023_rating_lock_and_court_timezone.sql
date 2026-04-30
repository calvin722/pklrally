-- =============================================================
-- 0023 — monthly rating lock + court timezone
-- =============================================================
-- 1. RATING LOCK: players can change their self-rating once per
--    calendar month. After a change, the rating is locked until the
--    1st of the next month. Admins can override (used for support /
--    fixing typos).
--
-- 2. COURT TIMEZONE: matches happen in a real place. The played_at
--    timestamp should be displayed in the COURT's timezone, not the
--    viewer's. Adds a `timezone` column to courts and backfills it
--    from state. New courts default the same way.
-- =============================================================

-- 1. Track when the rating was last changed
alter table public.players
  add column if not exists dupr_self_rating_changed_at timestamptz;

-- 2. Court timezone column + state-based backfill
alter table public.courts
  add column if not exists timezone text;

update public.courts set timezone = case
  when upper(state) in ('CT','DE','DC','FL','GA','MA','MD','ME','MI','NC','NH','NJ','NY','OH','PA','RI','SC','VA','VT','WV','IN','KY') then 'America/New_York'
  when upper(state) in ('AL','AR','IL','IA','LA','MN','MS','MO','OK','TX','TN','WI') then 'America/Chicago'
  when upper(state) = 'AZ' then 'America/Phoenix'
  when upper(state) in ('CO','MT','ND','NE','NM','SD','UT','WY','KS') then 'America/Denver'
  when upper(state) in ('CA','ID','NV','OR','WA') then 'America/Los_Angeles'
  when upper(state) = 'AK' then 'America/Anchorage'
  when upper(state) = 'HI' then 'Pacific/Honolulu'
  else 'America/Denver'
end
where timezone is null;

-- =============================================================
-- Rating-lock trigger
-- =============================================================
create or replace function public.players_check_rating_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  -- Only relevant on UPDATE when the rating actually changed
  if tg_op = 'UPDATE'
     and new.dupr_self_rating is distinct from old.dupr_self_rating
  then
    -- Admins can change anyone's rating any time
    select coalesce(is_admin, false) into caller_is_admin
    from public.players
    where auth_user_id = auth.uid()
    limit 1;

    if not coalesce(caller_is_admin, false)
       and old.dupr_self_rating_changed_at is not null
       and date_trunc('month', old.dupr_self_rating_changed_at)
           = date_trunc('month', now())
    then
      raise exception 'Rating is locked until the 1st of next month. You can change your rating once per month.'
        using errcode = 'P0001';
    end if;

    -- Stamp the change time
    new.dupr_self_rating_changed_at := now();
  end if;

  -- On INSERT, stamp if rating is set
  if tg_op = 'INSERT' and new.dupr_self_rating is not null then
    new.dupr_self_rating_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists players_rating_lock_trigger on public.players;
create trigger players_rating_lock_trigger
  before insert or update on public.players
  for each row execute function public.players_check_rating_lock();

-- Backfill: stamp existing rated players so they're "in this month"
-- but with a backdate to last month so they're NOT locked out
-- immediately after migration. They still get one change this month.
update public.players
set dupr_self_rating_changed_at =
  (date_trunc('month', now()) - interval '1 day')
where dupr_self_rating is not null
  and dupr_self_rating_changed_at is null;

-- =============================================================
-- DONE.
-- =============================================================
