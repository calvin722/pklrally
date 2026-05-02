-- =============================================================
-- 0029 — attendee confirmation flag
-- =============================================================
-- Splits attendees into "going" (confirmed = true) vs "invited"
-- (confirmed = false). Self-joins and creator auto-joins are
-- automatically confirmed. Invites added by another player start
-- unconfirmed until the invitee taps Confirm.
--
-- Default value is `false` so any new row that doesn't explicitly set
-- confirmed lands as a pending invite — safer default than the other
-- way around. Existing rows backfill to true since they predate this
-- distinction (every row before today was a self-join or creator).
-- =============================================================

alter table public.open_play_attendees
  add column if not exists confirmed boolean not null default false;

-- Backfill: existing data treated as confirmed
update public.open_play_attendees set confirmed = true where confirmed = false;

-- Update the creator-auto-join trigger to insert with confirmed = true
create or replace function public.open_play_blocks_auto_join_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.open_play_attendees (block_id, player_id, confirmed)
  values (new.id, new.created_by, true)
  on conflict (block_id, player_id) do nothing;
  return new;
end;
$$;

-- Allow players to update their own attendance row (so they can
-- confirm a pending invite). Inviters can also update rows they
-- invited — useful if we later add admin overrides.
drop policy if exists "open_play_attendees update" on public.open_play_attendees;
create policy "open_play_attendees update"
  on public.open_play_attendees for update
  using (
    player_id in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or invited_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  )
  with check (
    player_id in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or invited_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- =============================================================
-- DONE.
-- =============================================================
