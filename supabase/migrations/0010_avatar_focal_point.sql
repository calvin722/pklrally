-- =============================================================
-- 0010 — avatar focal point (object-position)
-- =============================================================
-- When a user uploads a tall portrait, the default center crop on circular
-- avatars often clips their face. Storing a focal point lets the Avatar
-- component render with `object-position: X% Y%` so the chosen point stays
-- visible in the circle.
-- =============================================================

alter table public.players
  add column if not exists avatar_focal_x numeric(5,2) not null default 50,
  add column if not exists avatar_focal_y numeric(5,2) not null default 50;

alter table public.players
  drop constraint if exists players_focal_x_range;
alter table public.players
  add constraint players_focal_x_range
  check (avatar_focal_x between 0 and 100);

alter table public.players
  drop constraint if exists players_focal_y_range;
alter table public.players
  add constraint players_focal_y_range
  check (avatar_focal_y between 0 and 100);

-- =============================================================
-- DONE.
-- =============================================================
