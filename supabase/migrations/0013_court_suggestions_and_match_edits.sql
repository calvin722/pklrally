-- =============================================================
-- 0013 — court suggestions + match edit/resubmit
-- =============================================================
-- Two RLS additions:
--   1. Authenticated users can INSERT public courts with status=pending_review.
--      Admin still controls which become 'active'.
--   2. The logger of a match can UPDATE it while it's pending or disputed —
--      lets them edit the score / cancel after a dispute.
-- =============================================================

-- 1) Public can suggest courts (status=pending_review, type=public only)
drop policy if exists "courts suggest by authed" on public.courts;
create policy "courts suggest by authed" on public.courts
  for insert with check (
    auth.uid() is not null
    and status = 'pending_review'
    and type = 'public'
  );

-- 2) Logger can update their own pending/disputed matches
drop policy if exists "matches update by logger" on public.matches;
create policy "matches update by logger" on public.matches
  for update using (
    exists (
      select 1 from public.players p
      where p.auth_user_id = auth.uid() and p.id = logged_by
    )
    and status in ('pending', 'disputed')
  );

-- 3) Logger can also delete their own vouches when resubmitting
--    (so opponents re-vouch the corrected match)
drop policy if exists "vouches delete by match logger" on public.vouches;
create policy "vouches delete by match logger" on public.vouches
  for delete using (
    exists (
      select 1
      from public.matches m
      join public.players p on p.auth_user_id = auth.uid()
      where m.id = match_id and m.logged_by = p.id
    )
  );

-- =============================================================
-- DONE.
-- =============================================================
