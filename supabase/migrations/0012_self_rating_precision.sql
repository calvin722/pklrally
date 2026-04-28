-- =============================================================
-- 0012 — widen dupr_self_rating from numeric(3,1) to numeric(3,2)
-- =============================================================
-- The original column was numeric(3,1) which silently rounds writes to 1
-- decimal place. With 0.25 increments (3.25, 3.50, 3.75) we need 2 decimals.
-- numeric(3,2) gives us 0.00–9.99 which covers our 2.0–8.0 range.
-- =============================================================

alter table public.players
  alter column dupr_self_rating type numeric(3,2);

-- (The existing range check 2.0–8.0 is preserved — alter type doesn't drop it.)

-- =============================================================
-- DONE.
-- =============================================================
