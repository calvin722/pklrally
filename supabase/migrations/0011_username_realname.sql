-- =============================================================
-- 0011 — username + real name + name privacy
-- =============================================================
-- Adds:
--   - username (unique, lowercase, 3–20 chars, [a-z0-9_])
--   - first_name, last_name (separate fields for display)
--   - name_public (boolean — whether real name shows publicly)
--
-- display_name remains the column that UI components render — populated
-- automatically by the trigger from the new fields:
--   - name_public AND (first OR last) → "First Last"
--   - else → username
--
-- This lets every existing component (MatchCard, AuthButton, profile, etc.)
-- keep reading display_name without needing per-component changes.
-- =============================================================

alter table public.players
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists name_public boolean not null default true;

-- Username format: 3–20 chars, lowercase letters/numbers/underscores only.
alter table public.players drop constraint if exists players_username_format;
alter table public.players add constraint players_username_format
  check (username is null or (
    char_length(username) between 3 and 20
    and username = lower(username)
    and username ~ '^[a-z0-9_]+$'
  ));

-- Case-insensitive uniqueness on username (when set)
create unique index if not exists players_username_unique
  on public.players(lower(username))
  where username is not null;

-- Trigger: keep display_name in sync with name fields
create or replace function public.refresh_display_name()
returns trigger language plpgsql as $$
declare
  full_name text;
begin
  if new.name_public then
    full_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  else
    full_name := '';
  end if;

  if full_name <> '' then
    new.display_name := full_name;
  elsif new.username is not null and new.username <> '' then
    new.display_name := new.username;
  end if;
  -- else: leave display_name as-is (may have been seeded from email at signup)

  return new;
end;
$$;

drop trigger if exists players_sync_display_name on public.players;
create trigger players_sync_display_name
  before insert or update on public.players
  for each row execute function public.refresh_display_name();

-- =============================================================
-- DONE.
-- =============================================================
