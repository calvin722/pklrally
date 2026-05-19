-- =============================================================
-- 0034 — Edit log for league_matches
-- =============================================================
-- Lets the league admin edit any score in any round (including past
-- rounds in an in-progress league, or finished leagues), with an
-- audit trail of what changed.
--
-- Two pieces:
--   1. last_edited_by / last_edited_at columns on league_matches —
--      the most recent edit, surfaced in the UI ("edited 5m ago by Y")
--   2. league_match_edits table — full audit log of every score change
--      with old + new values
-- =============================================================

alter table public.league_matches
  add column if not exists last_edited_by uuid
    references public.players(id) on delete set null,
  add column if not exists last_edited_at timestamptz;

create table if not exists public.league_match_edits (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.league_matches(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  edited_by uuid references public.players(id) on delete set null,
  old_team_a_score int,
  old_team_b_score int,
  new_team_a_score int,
  new_team_b_score int,
  edited_at timestamptz not null default now()
);

create index if not exists league_match_edits_match_idx
  on public.league_match_edits(match_id, edited_at desc);
create index if not exists league_match_edits_league_idx
  on public.league_match_edits(league_id, edited_at desc);

alter table public.league_match_edits enable row level security;

drop policy if exists "league_match_edits public read" on public.league_match_edits;
create policy "league_match_edits public read"
  on public.league_match_edits for select using (true);

-- Inserts are gated to the league creator (same pattern as league_matches).
drop policy if exists "league_match_edits write by creator" on public.league_match_edits;
create policy "league_match_edits write by creator"
  on public.league_match_edits for insert
  with check (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- =============================================================
-- DONE.
-- =============================================================
