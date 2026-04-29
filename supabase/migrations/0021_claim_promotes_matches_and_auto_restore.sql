-- =============================================================
-- 0021 — fix the guest-claim → match-status flow
-- =============================================================
-- Two updates needed for the invite/claim experience to feel right:
--
-- 1. PROMOTE MATCHES ON CLAIM:
--    When a logged match's opposing team was all-guest at log time, the
--    match was set to 'unverified_all_guest' (not vouchable). When ONE
--    of those guests later claims their account, we should promote any
--    such matches to 'pending' so the now-member can vouch the score.
--
-- 2. AUTO-RESTORE ON SIGN-IN:
--    Users who hit "Take a break" had `deleted_at` set on their player
--    row. Their auth.users row stayed intact, so they CAN sign back in
--    via magic link. When they do, restore them automatically — clear
--    deleted_at so they reappear in listings + ladder.
--
-- Both changes go in the same trigger (handle_new_auth_user) since that's
-- where the existing claim logic lives. We also add a separate
-- check-on-signin RPC for the auth callback to call on EVERY login (not
-- just first signup) to handle the "take a break" restore.
-- =============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
           invite_token_expires_at = null,
           deleted_at = null
     where id = existing_player;

    insert into public.events (player_id, event_type, payload)
    values (existing_player, 'guest_claimed', jsonb_build_object('email', new.email));

    -- ✱ NEW: promote any 'unverified_all_guest' matches where this player
    --   is on the OPPOSING team to the logger. Now there's a member who
    --   can vouch, so the match becomes vouchable.
    update public.matches m
    set status = 'pending'
    where m.status = 'unverified_all_guest'
      and (
        -- Case A: player is on receiver team, logger is on server team
        (
          (m.receiver_team_p1 = existing_player or m.receiver_team_p2 = existing_player)
          and (m.logged_by = m.server_team_p1 or m.logged_by = m.server_team_p2)
        )
        or
        -- Case B: player is on server team, logger is on receiver team
        (
          (m.server_team_p1 = existing_player or m.server_team_p2 = existing_player)
          and (m.logged_by = m.receiver_team_p1 or m.logged_by = m.receiver_team_p2)
        )
      );

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

-- =============================================================
-- post_sign_in_check — the auth callback calls this after every
-- successful sign-in. It:
--   1. Restores a soft-deleted ("take a break") account
--   2. Returns counts the callback can use to decide where to route
--      the user (welcome flow vs. vouch inbox)
-- =============================================================

create or replace function public.post_sign_in_check()
returns table (
  was_just_claimed boolean,
  was_restored boolean,
  pending_vouches bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_was_deleted boolean;
  v_claimed_at timestamptz;
  v_pending_vouches bigint;
begin
  select id, deleted_at is not null, claimed_at
    into v_player_id, v_was_deleted, v_claimed_at
  from public.players
  where auth_user_id = auth.uid()
  limit 1;

  if v_player_id is null then
    return query select false, false, 0::bigint;
    return;
  end if;

  -- 1. Auto-restore from a "take a break" soft-delete
  if v_was_deleted then
    update public.players
    set deleted_at = null,
        updated_at = now()
    where id = v_player_id;
  end if;

  -- 2. Count matches awaiting THIS player's vouch (status='pending',
  --    they're on the team opposite the logger)
  select count(*) into v_pending_vouches
  from public.matches m
  where m.status = 'pending'
    and (
      (
        (m.receiver_team_p1 = v_player_id or m.receiver_team_p2 = v_player_id)
        and (m.logged_by = m.server_team_p1 or m.logged_by = m.server_team_p2)
      )
      or (
        (m.server_team_p1 = v_player_id or m.server_team_p2 = v_player_id)
        and (m.logged_by = m.receiver_team_p1 or m.logged_by = m.receiver_team_p2)
      )
    );

  return query select
    coalesce(v_claimed_at > now() - interval '5 minutes', false) as was_just_claimed,
    v_was_deleted,
    v_pending_vouches;
end;
$$;

revoke all on function public.post_sign_in_check() from public;
grant execute on function public.post_sign_in_check() to authenticated;

-- =============================================================
-- DONE.
-- =============================================================
