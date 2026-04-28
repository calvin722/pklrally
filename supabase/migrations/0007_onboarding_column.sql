-- =============================================================
-- 0007 — onboarding completion timestamp on players
-- =============================================================
-- Adds a single column to track whether the user has completed the
-- /welcome onboarding form (display name + self-rating). Players land on
-- /welcome after sign-in until this is set.
-- =============================================================

alter table public.players
  add column if not exists onboarding_completed_at timestamptz;

-- Quick-look index — middleware / page guards will read this often
create index if not exists players_onboarding_idx
  on public.players(onboarding_completed_at);

-- =============================================================
-- DONE.
-- =============================================================
