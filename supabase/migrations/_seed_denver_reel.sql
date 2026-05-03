-- =============================================================
-- IG Reel seed: Denver courts populated with realistic open-play
--               blocks across 7 days + buzzing recent matches
-- =============================================================
-- One-time data seed — NOT a real migration. Runs as a transactional
-- DO block. Every seeded row carries '__seed__' in player display_name
-- so you can wipe everything cleanly with the cleanup script at the
-- bottom of this file.
--
-- What it does:
--   • Finds both active Denver, CO courts (by city/state)
--   • Inserts 14 fake guest players with realistic names + ratings
--   • Schedules 16 open-play blocks across the next 7 days, with
--     2 blocks every day plus 2 EXTRA on whatever the next Wednesday
--     happens to be (so it's the densest day, matching the reel
--     recording plan)
--   • Each block has 3-7 attendees, mostly confirmed with a few
--     "invited · waiting on confirmation" for visual variety
--   • Inserts 3 recent vouched matches (last 45 min) at Denver
--     courts so the home map dot pulsates
-- =============================================================

do $$
declare
  court_a uuid;
  court_b uuid;

  -- Date math — wed_date dynamically resolves to whatever the next
  -- Wednesday is, even if you run this on Tuesday or Thursday.
  base_date date := current_date;
  wed_offset int := ((3 - extract(dow from current_date)::int)::int + 7) % 7;
  wed_date date := current_date + wed_offset;

  -- Seed player IDs (14 total — varied first initials so avatar
  -- circles read as a real community)
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid;
  p8 uuid; p9 uuid; p10 uuid; p11 uuid; p12 uuid; p13 uuid; p14 uuid;

  block_id uuid;
begin
  -- ============================================================
  -- 1. Resolve Denver courts
  -- ============================================================
  -- Two simple SELECT INTOs since Postgres max() doesn't take uuid.
  select id into court_a
    from public.courts
   where lower(city) = 'denver'
     and lower(state) = 'co'
     and status = 'active'
   order by created_at
   limit 1;

  if court_a is null then
    raise exception 'No active Denver, CO courts found — add at least one before seeding';
  end if;

  select id into court_b
    from public.courts
   where lower(city) = 'denver'
     and lower(state) = 'co'
     and status = 'active'
     and id <> court_a
   order by created_at
   limit 1;

  if court_b is null then
    -- Only one Denver court exists; reuse it for both
    court_b := court_a;
  end if;

  -- ============================================================
  -- 2. Seed guest players
  -- ============================================================
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Sarah Klein',     '__seed__sarah_klein@pklrally.test',    true, 3.5,  true) returning id into p1;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Mike Reynolds',   '__seed__mike_reynolds@pklrally.test',   true, 4.0,  true) returning id into p2;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Jordan Tan',      '__seed__jordan_tan@pklrally.test',      true, 3.5,  true) returning id into p3;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Alex Martinez',   '__seed__alex_martinez@pklrally.test',   true, 4.25, true) returning id into p4;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Taylor Chen',     '__seed__taylor_chen@pklrally.test',     true, 3.0,  true) returning id into p5;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Morgan Davis',    '__seed__morgan_davis@pklrally.test',    true, 4.5,  true) returning id into p6;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Casey Rivera',    '__seed__casey_rivera@pklrally.test',    true, 3.5,  true) returning id into p7;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Avery Park',      '__seed__avery_park@pklrally.test',      true, 3.75, true) returning id into p8;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Riley Foster',    '__seed__riley_foster@pklrally.test',    true, 4.0,  true) returning id into p9;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Cameron Lee',     '__seed__cameron_lee@pklrally.test',     true, 3.5,  true) returning id into p10;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Quinn Webb',      '__seed__quinn_webb@pklrally.test',      true, 3.25, true) returning id into p11;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Sam Brennan',     '__seed__sam_brennan@pklrally.test',     true, 4.0,  true) returning id into p12;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Drew Kim',        '__seed__drew_kim@pklrally.test',        true, 3.5,  true) returning id into p13;
  insert into public.players (display_name, email, is_guest, dupr_self_rating, name_public)
    values ('Logan Ortiz',     '__seed__logan_ortiz@pklrally.test',     true, 4.25, true) returning id into p14;

  -- ============================================================
  -- 3. Blocks — 14 standard (2 per day × 7 days) + 2 extra Wednesday
  --    Times in America/Denver. Each block's creator is auto-joined
  --    by the trigger from migration 0027, so we add the OTHER
  --    attendees explicitly.
  -- ============================================================

  -- ---------- DAY +0 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_b, p1,
      ((base_date + 0) + time '17:30')::timestamp at time zone 'America/Denver',
      ((base_date + 0) + time '19:30')::timestamp at time zone 'America/Denver',
      'Casual rotation — all levels welcome')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p2,  true), (block_id, p3,  true),
    (block_id, p7,  true), (block_id, p9,  true);
  insert into public.open_play_attendees (block_id, player_id, confirmed, invited_by) values
    (block_id, p11, false, p1);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at)
    values (court_a, p9,
      ((base_date + 0) + time '08:00')::timestamp at time zone 'America/Denver',
      ((base_date + 0) + time '10:00')::timestamp at time zone 'America/Denver')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p4, true), (block_id, p10, true), (block_id, p13, true);

  -- ---------- DAY +1 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_a, p4,
      ((base_date + 1) + time '08:00')::timestamp at time zone 'America/Denver',
      ((base_date + 1) + time '10:00')::timestamp at time zone 'America/Denver',
      'Early bird crew')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p5, true), (block_id, p8, true), (block_id, p10, true);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_b, p2,
      ((base_date + 1) + time '18:00')::timestamp at time zone 'America/Denver',
      ((base_date + 1) + time '20:00')::timestamp at time zone 'America/Denver',
      'Level 3.5+ doubles')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p4,  true), (block_id, p6,  true),
    (block_id, p9,  true), (block_id, p12, true);

  -- ---------- DAY +2 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at)
    values (court_a, p7,
      ((base_date + 2) + time '08:30')::timestamp at time zone 'America/Denver',
      ((base_date + 2) + time '10:30')::timestamp at time zone 'America/Denver')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p1, true), (block_id, p3, true), (block_id, p11, true);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_a, p13,
      ((base_date + 2) + time '17:30')::timestamp at time zone 'America/Denver',
      ((base_date + 2) + time '19:30')::timestamp at time zone 'America/Denver',
      'Bring outdoor balls')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p2, true), (block_id, p5, true),
    (block_id, p8, true), (block_id, p14, true);
  insert into public.open_play_attendees (block_id, player_id, confirmed, invited_by) values
    (block_id, p10, false, p13);

  -- ---------- DAY +3 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at)
    values (court_b, p11,
      ((base_date + 3) + time '08:00')::timestamp at time zone 'America/Denver',
      ((base_date + 3) + time '10:00')::timestamp at time zone 'America/Denver')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p3, true), (block_id, p5, true), (block_id, p9, true);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_a, p14,
      ((base_date + 3) + time '17:00')::timestamp at time zone 'America/Denver',
      ((base_date + 3) + time '19:00')::timestamp at time zone 'America/Denver',
      'Round robin')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p2, true), (block_id, p6, true),
    (block_id, p8, true), (block_id, p13, true);

  -- ---------- DAY +4 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_a, p8,
      ((base_date + 4) + time '09:00')::timestamp at time zone 'America/Denver',
      ((base_date + 4) + time '11:00')::timestamp at time zone 'America/Denver',
      'Morning warm-up')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p1, true), (block_id, p4, true), (block_id, p10, true);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at)
    values (court_b, p5,
      ((base_date + 4) + time '18:00')::timestamp at time zone 'America/Denver',
      ((base_date + 4) + time '20:00')::timestamp at time zone 'America/Denver')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p2, true), (block_id, p7, true),
    (block_id, p9, true), (block_id, p12, true), (block_id, p14, true);
  insert into public.open_play_attendees (block_id, player_id, confirmed, invited_by) values
    (block_id, p11, false, p5);

  -- ---------- DAY +5 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_a, p12,
      ((base_date + 5) + time '09:00')::timestamp at time zone 'America/Denver',
      ((base_date + 5) + time '11:00')::timestamp at time zone 'America/Denver',
      'Weekend social — drinks after')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p3,  true), (block_id, p6,  true),
    (block_id, p8,  true), (block_id, p11, true), (block_id, p13, true);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_b, p4,
      ((base_date + 5) + time '13:00')::timestamp at time zone 'America/Denver',
      ((base_date + 5) + time '15:00')::timestamp at time zone 'America/Denver',
      'Saturday afternoon doubles')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p1, true), (block_id, p5, true),
    (block_id, p9, true), (block_id, p10, true), (block_id, p14, true);

  -- ---------- DAY +6 ----------
  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at)
    values (court_a, p3,
      ((base_date + 6) + time '08:30')::timestamp at time zone 'America/Denver',
      ((base_date + 6) + time '10:30')::timestamp at time zone 'America/Denver')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p1, true), (block_id, p7, true), (block_id, p11, true);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_b, p10,
      ((base_date + 6) + time '17:00')::timestamp at time zone 'America/Denver',
      ((base_date + 6) + time '19:00')::timestamp at time zone 'America/Denver',
      'Mixed-level evening')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p2, true), (block_id, p6, true),
    (block_id, p8, true), (block_id, p12, true);

  -- ============================================================
  -- 4. Two EXTRA blocks specifically on next-Wednesday (recording day)
  -- ============================================================
  -- Note: if the upcoming Wednesday already had blocks above (because
  -- it lands on day +N), the schedule will have FOUR blocks that day.
  -- That's deliberate — we want the recording day to be the densest.

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_b, p3,
      (wed_date + time '11:00')::timestamp at time zone 'America/Denver',
      (wed_date + time '13:00')::timestamp at time zone 'America/Denver',
      'Lunch rotation — bring your A game')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p5,  true), (block_id, p7,  true),
    (block_id, p10, true), (block_id, p12, true), (block_id, p14, true);
  insert into public.open_play_attendees (block_id, player_id, confirmed, invited_by) values
    (block_id, p2, false, p3);

  insert into public.open_play_blocks (court_id, created_by, starts_at, ends_at, notes)
    values (court_a, p6,
      (wed_date + time '16:00')::timestamp at time zone 'America/Denver',
      (wed_date + time '18:00')::timestamp at time zone 'America/Denver',
      'After-work rotation · 6 going')
    returning id into block_id;
  insert into public.open_play_attendees (block_id, player_id, confirmed) values
    (block_id, p2,  true), (block_id, p8,  true),
    (block_id, p9,  true), (block_id, p11, true),
    (block_id, p13, true), (block_id, p14, true);

  -- ============================================================
  -- 5. Recent vouched matches — for the home-page dot pulse
  -- ============================================================
  -- isCityBuzzing checks for matches within the last 60 min. Three
  -- matches at varying recent timestamps so the buzz is reliable.

  insert into public.matches (
    court_id, logged_by,
    server_team_p1, server_team_p2,
    receiver_team_p1, receiver_team_p2,
    server_score, receiver_score,
    played_at, status, vouched_at
  ) values (
    court_a, p1,
    p1, p2, p3, p4,
    11, 8,
    now() - interval '12 minutes', 'vouched', now() - interval '5 minutes'
  );

  insert into public.matches (
    court_id, logged_by,
    server_team_p1, server_team_p2,
    receiver_team_p1, receiver_team_p2,
    server_score, receiver_score,
    played_at, status, vouched_at
  ) values (
    court_b, p5,
    p5, p6, p7, p8,
    11, 9,
    now() - interval '28 minutes', 'vouched', now() - interval '20 minutes'
  );

  insert into public.matches (
    court_id, logged_by,
    server_team_p1, server_team_p2,
    receiver_team_p1, receiver_team_p2,
    server_score, receiver_score,
    played_at, status, vouched_at
  ) values (
    court_a, p9,
    p9, p10, p11, p12,
    11, 6,
    now() - interval '45 minutes', 'vouched', now() - interval '35 minutes'
  );

  raise notice 'Denver reel-seed complete · 16 blocks · 14 players · 3 recent matches';
end $$;

-- =============================================================
-- CLEANUP — paste + run this AFTER the reel is recorded
-- =============================================================
-- Marker lives in the email field ('__seed__*@pklrally.test') so it
-- never appears in the UI. Cleanup matches on that.

-- delete from public.matches
--   where server_team_p1 in (select id from public.players where email like '__seed__%@pklrally.test')
--      or server_team_p2 in (select id from public.players where email like '__seed__%@pklrally.test')
--      or receiver_team_p1 in (select id from public.players where email like '__seed__%@pklrally.test')
--      or receiver_team_p2 in (select id from public.players where email like '__seed__%@pklrally.test');
--
-- delete from public.open_play_blocks
--   where created_by in (select id from public.players where email like '__seed__%@pklrally.test');
--
-- -- open_play_attendees rows cascade-delete with their blocks.
--
-- delete from public.players where email like '__seed__%@pklrally.test';
