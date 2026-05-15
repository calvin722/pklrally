-- =============================================================
-- 0032 — Fix ambiguous column reference in respond_to_league_invite
-- =============================================================
-- The function in migration 0031 declared output columns (league_id,
-- status, player_id) via RETURNS TABLE. Those names collide with the
-- real columns of league_players + league_invites inside the function
-- body, causing:
--
--   "column reference 'league_id' is ambiguous"
--
-- when RSVP "Accept" runs. Fix is to add #variable_conflict use_column
-- at the top of the function — tells PL/pgSQL to resolve ambiguous
-- references to the table column, not the OUT name.
-- =============================================================

create or replace function public.respond_to_league_invite(
  p_token uuid,
  p_action text,
  p_display_name text default null
)
returns table (
  league_id uuid,
  status text,
  player_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_invite record;
  v_player_id uuid;
begin
  if p_action not in ('accept', 'decline') then
    raise exception 'Invalid action — must be accept or decline';
  end if;

  select * into v_invite
    from public.league_invites
   where invite_token = p_token
   limit 1;
  if not found then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    return query
      select v_invite.league_id, v_invite.status, v_invite.player_id;
    return;
  end if;

  if p_action = 'decline' then
    update public.league_invites
       set status = 'declined',
           responded_at = now()
     where invite_token = p_token;
    return query
      select v_invite.league_id, 'declined'::text, v_invite.player_id;
    return;
  end if;

  v_player_id := v_invite.player_id;
  if v_player_id is null then
    select id into v_player_id
      from public.players
     where lower(email) = lower(v_invite.email)
     limit 1;
  end if;
  if v_player_id is null then
    insert into public.players (display_name, email, phone, is_guest)
      values (
        coalesce(nullif(trim(p_display_name), ''), split_part(v_invite.email, '@', 1)),
        v_invite.email,
        v_invite.phone,
        true
      )
      returning id into v_player_id;
  end if;

  insert into public.league_players (league_id, player_id)
    values (v_invite.league_id, v_player_id)
    on conflict (league_id, player_id) do nothing;

  update public.league_invites
     set status = 'accepted',
         responded_at = now(),
         player_id = v_player_id
   where invite_token = p_token;

  return query
    select v_invite.league_id, 'accepted'::text, v_player_id;
end;
$$;

grant execute on function public.respond_to_league_invite(uuid, text, text) to anon, authenticated;

-- =============================================================
-- DONE.
-- =============================================================
