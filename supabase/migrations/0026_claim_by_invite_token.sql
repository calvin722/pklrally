-- =============================================================
-- 0026 — claim guest accounts by invite_token (in addition to email)
-- =============================================================
-- Powers the click-to-text flow:
--   1. Logger enters a friend's phone when adding a guest to a match
--   2. We persist a fresh `invite_token` on the new guest player row
--   3. Logger taps "Text Sarah her invite" — their phone opens an SMS
--      with a link like https://pklrally.com/c/<token>
--   4. The friend clicks the link, lands on /login?claim_token=<token>,
--      enters their email, gets a magic link
--   5. When they click the magic link, Supabase creates the auth.users
--      row with raw_user_meta_data = { claim_token: '<token>' }
--   6. This trigger sees the claim_token, looks up the guest row, and
--      attaches it to the new auth user — preserving all match history
--
-- This works alongside the existing email-based claim path. If both
-- match (e.g. logger entered email + phone, friend signs up with same
-- email), email wins, which is fine.
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
  v_claim_token text;
begin
  v_claim_token := new.raw_user_meta_data->>'claim_token';

  -- 1. First try to claim by email (existing path)
  select id into existing_player
  from public.players
  where email = new.email::citext
    and is_guest = true
    and auth_user_id is null
  limit 1;

  -- 2. If no email match AND we have a claim_token, try that
  if existing_player is null and v_claim_token is not null then
    select id into existing_player
    from public.players
    where invite_token = v_claim_token
      and is_guest = true
      and auth_user_id is null
      and (invite_token_expires_at is null or invite_token_expires_at > now())
    limit 1;
  end if;

  if existing_player is not null then
    update public.players
       set auth_user_id = new.id,
           is_guest = false,
           -- If the guest row had no email, copy from auth.users
           email = coalesce(public.players.email, new.email::citext),
           claimed_at = now(),
           invite_token = null,
           invite_token_expires_at = null,
           deleted_at = null
     where id = existing_player;

    insert into public.events (player_id, event_type, payload)
    values (
      existing_player,
      'guest_claimed',
      jsonb_build_object(
        'email', new.email,
        'via', case when v_claim_token is not null then 'token' else 'email' end
      )
    );

    -- Promote any 'unverified_all_guest' matches where this player is on
    -- the OPPOSING team to the logger (existing logic from 0021)
    update public.matches m
    set status = 'pending'
    where m.status = 'unverified_all_guest'
      and (
        (
          (m.receiver_team_p1 = existing_player or m.receiver_team_p2 = existing_player)
          and (m.logged_by = m.server_team_p1 or m.logged_by = m.server_team_p2)
        )
        or
        (
          (m.server_team_p1 = existing_player or m.server_team_p2 = existing_player)
          and (m.logged_by = m.receiver_team_p1 or m.logged_by = m.receiver_team_p2)
        )
      );

    return new;
  end if;

  -- No claim — create a fresh player
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
-- DONE.
-- =============================================================
