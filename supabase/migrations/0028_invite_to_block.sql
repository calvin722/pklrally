-- =============================================================
-- 0028 — invite friends to open play blocks
-- =============================================================
-- Adds `invited_by` to attendees + loosens RLS so any logged-in player
-- can add another player to a block (i.e. invite a friend). The
-- invited_by column powers later "you invited Sarah" affordances and
-- lets the inviter remove someone they invited.
-- =============================================================

alter table public.open_play_attendees
  add column if not exists invited_by uuid references public.players(id)
    on delete set null;

create index if not exists open_play_attendees_invited_by_idx
  on public.open_play_attendees(invited_by);

-- Replace the strict "only join yourself" insert policy with one that
-- allows logged-in users to either join themselves OR add others (with
-- invited_by stamped as the current player).
drop policy if exists "open_play_attendees join self" on public.open_play_attendees;
drop policy if exists "open_play_attendees insert" on public.open_play_attendees;
create policy "open_play_attendees insert"
  on public.open_play_attendees for insert
  with check (
    -- self-join: player_id matches the calling user's player row
    player_id in (
      select id from public.players where auth_user_id = auth.uid()
    )
    -- or invite: the invited_by column matches the calling user's player
    -- row (so we can attribute the invite + permit removal later).
    or invited_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- Replace the leave-self-only delete policy with one that also lets the
-- inviter remove someone they added.
drop policy if exists "open_play_attendees leave self" on public.open_play_attendees;
drop policy if exists "open_play_attendees delete" on public.open_play_attendees;
create policy "open_play_attendees delete"
  on public.open_play_attendees for delete
  using (
    -- leave self
    player_id in (
      select id from public.players where auth_user_id = auth.uid()
    )
    -- or you invited them
    or invited_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- =============================================================
-- DONE.
-- =============================================================
