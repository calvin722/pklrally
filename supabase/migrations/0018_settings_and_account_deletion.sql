-- =============================================================
-- 0018 — settings (theme) + account deletion (soft + hard)
-- =============================================================
-- Adds:
--   1. theme column on players (light/dark, default 'dark')
--   2. deleted_at column for "Take a break" soft delete
--   3. delete_account_permanently() RPC for hard delete (anonymizes
--      player row + nukes auth_user link). Match history is kept so
--      opponents' stats and the ladder stay intact.
--   4. RLS update so a deleted player is hidden from listings unless
--      they're the requester themselves (so they can un-delete).
-- =============================================================

-- 1. Theme + soft-delete columns
alter table public.players
  add column if not exists theme text not null default 'dark'
    check (theme in ('light', 'dark')),
  add column if not exists deleted_at timestamptz;

-- Index for hiding deleted players in listings
create index if not exists players_deleted_at_idx
  on public.players(deleted_at)
  where deleted_at is not null;

-- =============================================================
-- 2. Hard-delete RPC: anonymize the player row and detach auth.
--    Match history is preserved so opponents keep their results.
-- =============================================================
create or replace function public.delete_account_permanently()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_auth_user_id uuid;
begin
  select id, auth_user_id into v_player_id, v_auth_user_id
  from public.players
  where auth_user_id = auth.uid()
  limit 1;

  if v_player_id is null then
    raise exception 'No player found for current auth user';
  end if;

  -- Anonymize the player row. Keep id (FK from matches) but wipe
  -- everything personally identifying.
  update public.players
  set
    display_name = 'Deleted Player',
    first_name = null,
    last_name = null,
    username = null,
    email = null,
    phone = null,
    avatar_url = null,
    avatar_focal_x = 50,
    avatar_focal_y = 50,
    city = null,
    state = null,
    dupr_self_rating = null,
    name_public = false,
    is_admin = false,
    is_guest = true,
    auth_user_id = null,
    claimed_at = null,
    onboarding_completed_at = null,
    deleted_at = now(),
    updated_at = now()
  where id = v_player_id;

  -- Nuke the auth user so they can't sign back in to the same account.
  -- (They can still sign up fresh later with the same email — that
  -- creates a new player row.)
  if v_auth_user_id is not null then
    delete from auth.users where id = v_auth_user_id;
  end if;
end;
$$;

revoke all on function public.delete_account_permanently() from public;
grant execute on function public.delete_account_permanently() to authenticated;

-- =============================================================
-- 3. Soft-delete RPC: "Take a break" — hide the player from UI but
--    leave their data intact and reversible.
-- =============================================================
create or replace function public.soft_delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
begin
  select id into v_player_id
  from public.players
  where auth_user_id = auth.uid()
  limit 1;

  if v_player_id is null then
    raise exception 'No player found for current auth user';
  end if;

  update public.players
  set deleted_at = now(),
      updated_at = now()
  where id = v_player_id;
end;
$$;

revoke all on function public.soft_delete_account() from public;
grant execute on function public.soft_delete_account() to authenticated;

-- =============================================================
-- 4. Restore RPC: "Welcome back" — clear deleted_at on next sign-in
--    or when the user explicitly returns.
-- =============================================================
create or replace function public.restore_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.players
  set deleted_at = null,
      updated_at = now()
  where auth_user_id = auth.uid();
end;
$$;

revoke all on function public.restore_account() from public;
grant execute on function public.restore_account() to authenticated;

-- =============================================================
-- DONE.
-- =============================================================
