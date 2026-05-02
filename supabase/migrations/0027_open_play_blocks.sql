-- =============================================================
-- 0027 — Find a Game: open play blocks + attendees
-- =============================================================
-- Two tables that power the /play section:
--
--   open_play_blocks    one row per scheduled session at a court
--   open_play_attendees join table: who's going to which block
--
-- v1 design notes:
--   - No attendee cap. Courts vary from 2 to 10+ courts; a soft cap
--     would be wrong everywhere.
--   - Public visibility. Anyone can read; logged-in users can write.
--   - One-off blocks only. Recurring is a v2 feature.
--   - The creator is auto-joined as the first attendee on insert via
--     a trigger so we don't have to do it client-side.
-- =============================================================

create table if not exists public.open_play_blocks (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  created_by uuid not null references public.players(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  status text not null default 'open'
    check (status in ('open', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint open_play_blocks_time_check check (ends_at > starts_at)
);

create index if not exists open_play_blocks_court_starts_idx
  on public.open_play_blocks(court_id, starts_at desc);

create index if not exists open_play_blocks_starts_idx
  on public.open_play_blocks(starts_at desc);

-- -----------------------------------------------------------
-- Attendees join table
-- -----------------------------------------------------------
create table if not exists public.open_play_attendees (
  block_id uuid not null references public.open_play_blocks(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (block_id, player_id)
);

create index if not exists open_play_attendees_player_idx
  on public.open_play_attendees(player_id);

-- -----------------------------------------------------------
-- Auto-join the creator as the first attendee
-- -----------------------------------------------------------
create or replace function public.open_play_blocks_auto_join_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.open_play_attendees (block_id, player_id)
  values (new.id, new.created_by)
  on conflict (block_id, player_id) do nothing;
  return new;
end;
$$;

drop trigger if exists open_play_blocks_auto_join_trigger on public.open_play_blocks;
create trigger open_play_blocks_auto_join_trigger
  after insert on public.open_play_blocks
  for each row execute function public.open_play_blocks_auto_join_creator();

-- -----------------------------------------------------------
-- RLS
-- -----------------------------------------------------------
alter table public.open_play_blocks enable row level security;
alter table public.open_play_attendees enable row level security;

-- Anyone (logged in or anonymous) can read blocks
drop policy if exists "open_play_blocks public read" on public.open_play_blocks;
create policy "open_play_blocks public read"
  on public.open_play_blocks for select
  using (true);

-- Logged-in players can create their own blocks
drop policy if exists "open_play_blocks insert self" on public.open_play_blocks;
create policy "open_play_blocks insert self"
  on public.open_play_blocks for insert
  with check (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
  );

-- Creator can update or delete their own blocks
drop policy if exists "open_play_blocks update own" on public.open_play_blocks;
create policy "open_play_blocks update own"
  on public.open_play_blocks for update
  using (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "open_play_blocks delete own" on public.open_play_blocks;
create policy "open_play_blocks delete own"
  on public.open_play_blocks for delete
  using (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- Attendees: public read, logged-in players can join/leave themselves
drop policy if exists "open_play_attendees public read" on public.open_play_attendees;
create policy "open_play_attendees public read"
  on public.open_play_attendees for select
  using (true);

drop policy if exists "open_play_attendees join self" on public.open_play_attendees;
create policy "open_play_attendees join self"
  on public.open_play_attendees for insert
  with check (
    player_id in (
      select id from public.players where auth_user_id = auth.uid()
    )
  );

drop policy if exists "open_play_attendees leave self" on public.open_play_attendees;
create policy "open_play_attendees leave self"
  on public.open_play_attendees for delete
  using (
    player_id in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- =============================================================
-- DONE.
-- =============================================================
