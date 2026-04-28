-- =============================================================
-- 0008 — match_likes table (heart count on match cards)
-- =============================================================

create table if not exists public.match_likes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists match_likes_match_idx on public.match_likes(match_id);
create index if not exists match_likes_player_idx on public.match_likes(player_id);

alter table public.match_likes enable row level security;

-- Anyone (anon or authenticated) can read like counts — they're public social signal.
drop policy if exists "match_likes read all" on public.match_likes;
create policy "match_likes read all" on public.match_likes
  for select using (true);

-- Authenticated users can like as themselves.
drop policy if exists "match_likes insert self" on public.match_likes;
create policy "match_likes insert self" on public.match_likes
  for insert with check (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.id = player_id)
  );

-- And remove their own like (toggle).
drop policy if exists "match_likes delete self" on public.match_likes;
create policy "match_likes delete self" on public.match_likes
  for delete using (
    exists (select 1 from public.players p
            where p.auth_user_id = auth.uid() and p.id = player_id)
  );

-- =============================================================
-- DONE.
-- =============================================================
