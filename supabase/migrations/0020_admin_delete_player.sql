-- =============================================================
-- 0020 — admin_delete_player() RPC
-- =============================================================
-- Lets an admin permanently delete any player account from the admin UI.
-- Uses the same anonymize-but-keep-history strategy as the user-facing
-- delete_account_permanently() (migration 0018):
--   - Wipe identifying fields, leave the row so match FKs remain valid
--   - Set deleted_at + display_name = 'Deleted Player'
--   - Drop the auth.users row so the user can no longer sign in
--
-- Match history stays intact so opponents' stats and the ladder don't
-- get retroactively rewritten. The deleted player just shows up as
-- "Deleted Player" everywhere.
--
-- Refuses to delete:
--   - The caller themselves (they should use /settings)
--   - Other admins (admins must demote each other first — guardrail
--     so a single rogue admin can't nuke the team)
-- =============================================================

create or replace function public.admin_delete_player(target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_player_id uuid;
  v_caller_is_admin boolean;
  v_target_auth uuid;
  v_target_is_admin boolean;
begin
  -- 1. Caller must be a current admin
  select id, is_admin into v_caller_player_id, v_caller_is_admin
  from public.players
  where auth_user_id = auth.uid()
  limit 1;

  if v_caller_player_id is null or coalesce(v_caller_is_admin, false) = false then
    raise exception 'Only admins can delete other accounts';
  end if;

  -- 2. Refuse self-delete (use /settings instead)
  if v_caller_player_id = target_player_id then
    raise exception 'Use /settings to delete your own account';
  end if;

  -- 3. Refuse admin-on-admin delete
  select auth_user_id, is_admin into v_target_auth, v_target_is_admin
  from public.players
  where id = target_player_id;

  if v_target_is_admin then
    raise exception 'Cannot delete another admin. Demote them first.';
  end if;

  -- 4. Anonymize the target row
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
  where id = target_player_id;

  -- 5. Drop the auth user so they can't sign back in
  if v_target_auth is not null then
    delete from auth.users where id = v_target_auth;
  end if;
end;
$$;

revoke all on function public.admin_delete_player(uuid) from public;
grant execute on function public.admin_delete_player(uuid) to authenticated;

-- =============================================================
-- DONE.
-- =============================================================
