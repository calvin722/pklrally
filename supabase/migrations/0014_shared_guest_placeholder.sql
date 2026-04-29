-- =============================================================
-- 0014 — single shared "Guest" placeholder player
-- =============================================================
-- Without this, every time a user types "guest" / "anon" / "?" as a player
-- name and clicks Add as guest, we'd create a fresh players row. That bloats
-- the table and gives meaningless stats.
--
-- This seeds ONE shared "Guest" row with no email and no auth_user_id,
-- which lib/rally.ts createGuest will reuse for all generic placeholder names.
-- Email-based invites still create individual guest rows (they're real
-- people who'll claim their account on signup).
-- =============================================================

insert into public.players (display_name, is_guest, email, auth_user_id, name_public)
select 'Guest', true, null, null, true
where not exists (
  select 1 from public.players
  where is_guest = true
    and auth_user_id is null
    and email is null
    and display_name = 'Guest'
);

-- =============================================================
-- DONE.
-- =============================================================
