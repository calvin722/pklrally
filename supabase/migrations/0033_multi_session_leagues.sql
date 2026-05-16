-- =============================================================
-- 0033 — Multi-session leagues (recurring / multi-day)
-- =============================================================
-- A league can now span multiple sessions (typically weekly). Each
-- session has its own round series (1..n_rounds per session), but
-- standings accumulate across all sessions.
--
-- Schema additions:
--   leagues.n_sessions        — total sessions (1 = single-day, original)
--   leagues.current_session   — which session is being played (1-indexed)
--   leagues.session_dates     — array of scheduled timestamps, one per session
--   league_rounds.session_number — which session this round belongs to
--
-- Existing leagues (created before this migration) get n_sessions=1
-- and session_number=1, so they keep working unchanged.
-- =============================================================

alter table public.leagues
  add column if not exists n_sessions int not null default 1
    check (n_sessions between 1 and 52),
  add column if not exists current_session int not null default 1
    check (current_session >= 1),
  add column if not exists session_dates timestamptz[];

alter table public.league_rounds
  add column if not exists session_number int not null default 1
    check (session_number >= 1);

-- The original unique (league_id, round_number) breaks once session 2 has
-- its own round 1. Drop the old constraint, add a session-aware unique.
alter table public.league_rounds
  drop constraint if exists league_rounds_league_id_round_number_key;

create unique index if not exists league_rounds_session_round_idx
  on public.league_rounds (league_id, session_number, round_number);

-- =============================================================
-- DONE.
-- =============================================================
