-- =============================================================
-- 0030 — Ladder Leagues (King of the Court format)
-- =============================================================
-- A "league" here is a single league NIGHT — a one-shot tournament
-- run by an admin (the creator) with a fixed roster of players,
-- a fixed number of rounds, and 4 courts (configurable).
--
-- Format: King of the Court. Each Round, all 4 courts play one game
-- simultaneously. Winners move up a court, losers move down. Byes
-- rotate on a FIXED schedule (5 groups of 4 → each group sits round
-- g and round g+5) so every player plays the same number of games.
--
-- Scoring: winning team = game score + 10-point bonus; losing team
-- gets just their game score. Cumulative across rounds → standings.
--
-- v1 scope notes:
--   - One night, no multi-week season yet
--   - One admin = the league creator
--   - Public read of standings/rounds; only the admin can advance
--   - Score edits only on the CURRENT (in-progress) round
--   - Round generation logic lives in TypeScript (lib/leagues.ts);
--     this migration is tables + RLS only
-- =============================================================

-- -----------------------------------------------------------
-- leagues — one row per league night
-- -----------------------------------------------------------
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.players(id) on delete cascade,
  court_id uuid references public.courts(id) on delete set null,

  n_courts int not null default 4 check (n_courts between 1 and 10),
  n_rounds int not null default 10 check (n_rounds between 1 and 30),
  win_bonus int not null default 10 check (win_bonus >= 0),

  format text not null default 'kotc'
    check (format in ('kotc', 'mixer')),
  partner_mode text not null default 'shuffled'
    check (partner_mode in ('shuffled', 'fixed')),

  court_rules text,                              -- free-text: "11 win by 1", "10-min high score", etc.

  status text not null default 'setup'
    check (status in ('setup', 'in_progress', 'finished', 'cancelled')),
  current_round int not null default 0,          -- 0 = not started; 1..n_rounds while playing

  -- Current ladder ordering of all players (top of ladder first). Refreshed
  -- after every round based on win/loss + bye-hold logic. Used to drive
  -- court assignments for the next round.
  player_order uuid[] not null default '{}'::uuid[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leagues_created_by_idx
  on public.leagues(created_by);
create index if not exists leagues_status_created_idx
  on public.leagues(status, created_at desc);

-- -----------------------------------------------------------
-- league_players — roster
-- -----------------------------------------------------------
create table if not exists public.league_players (
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  bye_group int check (bye_group between 1 and 10),  -- assigned when round 1 generates
  joined_at timestamptz not null default now(),
  primary key (league_id, player_id)
);

create index if not exists league_players_league_idx
  on public.league_players(league_id);
create index if not exists league_players_player_idx
  on public.league_players(player_id);

-- -----------------------------------------------------------
-- league_rounds — one row per round per league
-- -----------------------------------------------------------
create table if not exists public.league_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  round_number int not null check (round_number >= 1),
  byes uuid[] not null default '{}'::uuid[],       -- player_ids sitting this round
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (league_id, round_number)
);

create index if not exists league_rounds_league_idx
  on public.league_rounds(league_id, round_number);

-- -----------------------------------------------------------
-- league_matches — one row per court per round
-- -----------------------------------------------------------
create table if not exists public.league_matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  round_id uuid not null references public.league_rounds(id) on delete cascade,
  court_number int not null check (court_number >= 1),

  -- Team A
  team_a_p1 uuid not null references public.players(id) on delete cascade,
  team_a_p2 uuid not null references public.players(id) on delete cascade,
  -- Team B
  team_b_p1 uuid not null references public.players(id) on delete cascade,
  team_b_p2 uuid not null references public.players(id) on delete cascade,

  team_a_score int check (team_a_score is null or team_a_score >= 0),
  team_b_score int check (team_b_score is null or team_b_score >= 0),
  winner text check (winner in ('a', 'b') or winner is null),

  created_at timestamptz not null default now(),
  scored_at timestamptz,

  unique (round_id, court_number)
);

create index if not exists league_matches_league_idx
  on public.league_matches(league_id);
create index if not exists league_matches_round_idx
  on public.league_matches(round_id);

-- =============================================================
-- RLS
-- =============================================================
alter table public.leagues          enable row level security;
alter table public.league_players   enable row level security;
alter table public.league_rounds    enable row level security;
alter table public.league_matches   enable row level security;

-- ---- leagues ----------------------------------------------
drop policy if exists "leagues public read" on public.leagues;
create policy "leagues public read"
  on public.leagues for select using (true);

drop policy if exists "leagues insert self" on public.leagues;
create policy "leagues insert self"
  on public.leagues for insert
  with check (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
  );

drop policy if exists "leagues update own" on public.leagues;
create policy "leagues update own"
  on public.leagues for update
  using (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  )
  with check (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "leagues delete own" on public.leagues;
create policy "leagues delete own"
  on public.leagues for delete
  using (
    created_by in (
      select id from public.players where auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- ---- league_players ---------------------------------------
drop policy if exists "league_players public read" on public.league_players;
create policy "league_players public read"
  on public.league_players for select using (true);

-- Only the league creator (or admin) can add/remove players from a league
drop policy if exists "league_players insert by creator" on public.league_players;
create policy "league_players insert by creator"
  on public.league_players for insert
  with check (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_players update by creator" on public.league_players;
create policy "league_players update by creator"
  on public.league_players for update
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_players delete by creator" on public.league_players;
create policy "league_players delete by creator"
  on public.league_players for delete
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- ---- league_rounds ----------------------------------------
drop policy if exists "league_rounds public read" on public.league_rounds;
create policy "league_rounds public read"
  on public.league_rounds for select using (true);

drop policy if exists "league_rounds insert by creator" on public.league_rounds;
create policy "league_rounds insert by creator"
  on public.league_rounds for insert
  with check (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_rounds update by creator" on public.league_rounds;
create policy "league_rounds update by creator"
  on public.league_rounds for update
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_rounds delete by creator" on public.league_rounds;
create policy "league_rounds delete by creator"
  on public.league_rounds for delete
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

-- ---- league_matches ---------------------------------------
drop policy if exists "league_matches public read" on public.league_matches;
create policy "league_matches public read"
  on public.league_matches for select using (true);

drop policy if exists "league_matches insert by creator" on public.league_matches;
create policy "league_matches insert by creator"
  on public.league_matches for insert
  with check (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_matches update by creator" on public.league_matches;
create policy "league_matches update by creator"
  on public.league_matches for update
  using (
    league_id in (
      select l.id from public.leagues l
      join public.players p on p.id = l.created_by
      where p.auth_user_id = auth.uid()
    )
    or public.is_current_user_admin()
  );

drop policy if exists "league_matches delete by creator" on public.league_matches;
create policy "league_matches delete by creator"
  on public.league_matches for delete
  using (
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
