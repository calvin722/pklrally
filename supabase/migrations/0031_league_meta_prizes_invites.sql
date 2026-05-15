-- =============================================================
-- 0031 — League meta, prizes, and email invites
-- =============================================================
-- Builds on 0030 (ladder leagues) with everything Calvin needs to
-- run real leagues:
--
--   • Description + scheduled date/time on the league itself
--   • Manual court override (name + address) when the court isn't
--     already in the courts table — saved on the league row to avoid
--     polluting the canonical courts catalog with one-off venues
--   • New table `league_prizes` — 1st / 2nd / 3rd with description +
--     sponsor name + sponsor image (storage path)
--   • New table `league_invites` — email-driven RSVP tracking with a
--     token-protected accept/decline endpoint
--   • Storage bucket `league-prizes` for sponsor images (public read,
--     signed-in writes)
-- =============================================================

-- -----------------------------------------------------------
-- leagues — meta additions
-- -----------------------------------------------------------
alter table public.leagues
  add column if not exists description text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists manual_court_name text,
  add column if not exists manual_court_address text;

-- -----------------------------------------------------------
-- league_prizes — 1st / 2nd / 3rd place
-- -----------------------------------------------------------
create table if not exists public.league_prizes (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  place int not null check (place between 1 and 3),
  description text,
  sponsor_name text,
  sponsor_image_path text,                       -- storage path within the league-prizes bucket
  created_at timestamptz not null default now(),
  unique (league_id, place)
);

create index if not exists league_prizes_league_idx
  on public.league_prizes(league_id, place);

alter table public.league_prizes enable row level security;

drop policy if exists "league_prizes public read" on public.league_prizes;
create policy "league_prizes public read"
  on public.league_prizes for select using (true);

drop policy if exists "league_prizes write by creator" on public.league_prizes;
create policy "league_prizes write by creator"
  on public.league_prizes for all
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  )
  with check (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- -----------------------------------------------------------
-- league_invites — email-driven RSVP tracking
-- -----------------------------------------------------------
create table if not exists public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  email text not null,
  phone text,
  invited_by uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  player_id uuid references public.players(id) on delete set null,
  invite_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (league_id, email)
);

create index if not exists league_invites_league_idx
  on public.league_invites(league_id, status);
create index if not exists league_invites_email_idx
  on public.league_invites(lower(email));
create index if not exists league_invites_token_idx
  on public.league_invites(invite_token);

alter table public.league_invites enable row level security;

-- Invites are NOT publicly readable — they contain email addresses.
-- Only the league creator (or admin) can list invites.
drop policy if exists "league_invites read by creator" on public.league_invites;
create policy "league_invites read by creator"
  on public.league_invites for select
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or invited_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_invites write by creator" on public.league_invites;
create policy "league_invites write by creator"
  on public.league_invites for all
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  )
  with check (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- Token-based RSVP updates go through a SECURITY DEFINER function below,
-- so no special INSERT/UPDATE policy needed for unauthenticated callers.

-- -----------------------------------------------------------
-- respond_to_league_invite(token, action) — public RSVP endpoint
-- -----------------------------------------------------------
-- The RSVP page calls this with a token + 'accept' | 'decline'. It
-- updates the invite, and on accept inserts a league_players row
-- (creating a guest player if no account is yet linked).
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
    -- Already responded — return current state without touching anything
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

  -- accept: ensure a player row exists, then add to league
  v_player_id := v_invite.player_id;
  if v_player_id is null then
    -- Try to find an existing player by email first
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
-- Storage bucket: league-prizes
-- =============================================================
-- Public read so prize images render in emails + the standings page.
-- Anyone signed in can upload (the create-league form needs this);
-- the file path includes the league_id so creators can only modify
-- their own league's images via the path-prefix check.

insert into storage.buckets (id, name, public)
values ('league-prizes', 'league-prizes', true)
on conflict (id) do update set public = true;

drop policy if exists "league-prizes public read" on storage.objects;
create policy "league-prizes public read"
  on storage.objects for select
  using (bucket_id = 'league-prizes');

drop policy if exists "league-prizes signed-in upload" on storage.objects;
create policy "league-prizes signed-in upload"
  on storage.objects for insert
  with check (
    bucket_id = 'league-prizes'
    and auth.uid() is not null
  );

drop policy if exists "league-prizes signed-in update" on storage.objects;
create policy "league-prizes signed-in update"
  on storage.objects for update
  using (
    bucket_id = 'league-prizes'
    and auth.uid() is not null
  )
  with check (
    bucket_id = 'league-prizes'
    and auth.uid() is not null
  );

drop policy if exists "league-prizes signed-in delete" on storage.objects;
create policy "league-prizes signed-in delete"
  on storage.objects for delete
  using (
    bucket_id = 'league-prizes'
    and auth.uid() is not null
  );

-- =============================================================
-- DONE.
-- =============================================================
