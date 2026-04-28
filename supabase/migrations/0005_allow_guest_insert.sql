-- =============================================================
-- 0005 — allow any signed-in user to create guest player rows
-- =============================================================
-- Bug: 0001 only had an admin INSERT policy on players, so non-admin users
-- can't create guests via the rally flow. The guest player creation in
-- saveMatch() was silently failing (or being blocked) for them.
--
-- Fix: a narrowly-scoped INSERT policy that lets any authenticated user
-- create rows ONLY for unclaimed guests (auth_user_id IS NULL, is_guest = true).
-- Admins keep their broader "players admin all" policy from 0002.
-- =============================================================

drop policy if exists "players insert guest by authed" on public.players;

create policy "players insert guest by authed" on public.players
  for insert
  with check (
    auth.uid() is not null
    and is_guest = true
    and auth_user_id is null
  );

-- =============================================================
-- DONE.
-- =============================================================
