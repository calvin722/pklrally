-- =============================================================
-- 0002 — fix RLS recursion on players (and downstream tables)
-- =============================================================
-- Bug: the "players admin all" policy in 0001 self-referenced the players
-- table, causing infinite recursion when Postgres evaluated RLS on any
-- read of public.players (and any policy on other tables that queries
-- players to check admin status).
--
-- Fix: introduce a SECURITY DEFINER function that bypasses RLS for the
-- admin lookup, then rewrite all admin policies to use it.
-- =============================================================

-- Drop the recursive admin policies
drop policy if exists "players admin all" on public.players;
drop policy if exists "courts admin write" on public.courts;
drop policy if exists "matches admin all" on public.matches;
drop policy if exists "events admin read" on public.events;

-- Helper: is the currently-authenticated user an admin?
-- security definer + stable + explicit search_path = bypasses RLS safely.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.players
     where auth_user_id = auth.uid()
     limit 1),
    false
  );
$$;

-- Lock down execute permission to authenticated users only
revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.is_current_user_admin() to service_role;

-- Recreate admin policies using the helper (no recursion)
create policy "players admin all" on public.players
  for all using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "courts admin write" on public.courts
  for all using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "matches admin all" on public.matches
  for all using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "events admin read" on public.events
  for select using (public.is_current_user_admin());

-- =============================================================
-- DONE.
-- =============================================================
