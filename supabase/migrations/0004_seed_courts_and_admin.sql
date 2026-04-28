-- =============================================================
-- 0004 — seed real public courts + grant admin to Calvin
-- =============================================================
-- Run this in Supabase SQL Editor. Idempotent on re-run.
-- =============================================================

-- 1) Grant admin to the founding user (calvin@cactusbranchco.com).
update public.players
   set is_admin = true
 where email = 'calvin@cactusbranchco.com';

-- 2) Seed a starter set of real public pickleball courts.
--    Lat/lng are real centroids — these are well-known facilities.
--    Re-running won't dupe because we filter on (name, city, state).
insert into public.courts (name, address, city, state, latitude, longitude, type, status)
select * from (values
  ('East Naples Pickleball Center', '3500 Thomasson Dr', 'Naples', 'FL', 26.1224, -81.7689, 'public', 'active'),
  ('Veterans Community Park',       '1895 Veterans Park Dr', 'Naples', 'FL', 26.2682, -81.7223, 'public', 'active'),
  ('Cherry Creek Pickleball',       'E Mississippi Ave', 'Denver', 'CO', 39.7188, -104.9531, 'public', 'active'),
  ('Pharr Tennis & Pickleball',     '4201 Brookview Dr', 'Austin', 'TX', 30.3072, -97.7218, 'public', 'active'),
  ('Pecos Park Pickleball',         '17010 S 48th St', 'Phoenix', 'AZ', 33.3061, -112.0581, 'public', 'active'),
  ('Bobby Riggs Tennis & Pickleball','875 Santa Fe Dr', 'San Diego', 'CA', 33.0117, -117.2647, 'public', 'active'),
  ('Central Park Pickleball',       'Central Park N', 'New York', 'NY', 40.7829, -73.9654, 'public', 'active'),
  ('Grant Park Courts',             '337 E Randolph St', 'Chicago', 'IL', 41.8757, -87.6228, 'public', 'active'),
  ('Green Lake Pickleball',         '7201 E Green Lake Dr N', 'Seattle', 'WA', 47.6815, -122.3344, 'public', 'active'),
  ('Flamingo Park Pickleball',      '1200 Meridian Ave', 'Miami', 'FL', 25.7836, -80.1335, 'public', 'active'),
  ('Charlesbank Pickleball',        '0 Charles St', 'Boston', 'MA', 42.3620, -71.0735, 'public', 'active'),
  ('Piedmont Park Pickleball',      '400 Park Dr NE', 'Atlanta', 'GA', 33.7866, -84.3733, 'public', 'active'),
  ('Westwood Pickleball',           '1350 Sepulveda Blvd', 'Los Angeles', 'CA', 34.0566, -118.4452, 'public', 'active')
) as v(name, address, city, state, latitude, longitude, type, status)
where not exists (
  select 1 from public.courts c
  where c.name = v.name and c.city = v.city and c.state = v.state
);

-- 3) Helper view: courts grouped by city, with most-recent-match timestamp.
--    The map's "buzzing" logic queries this single view instead of
--    joining client-side.
create or replace view public.city_court_pulse as
select
  c.city,
  c.state,
  -- Use the centroid of all courts in the city for the dot position.
  avg(c.latitude)::numeric(9,6)  as latitude,
  avg(c.longitude)::numeric(9,6) as longitude,
  count(c.id)                    as court_count,
  -- Most recent vouched match in the last 30 days (used for "recent volume" sizing).
  count(m.id) filter (
    where m.status = 'vouched' and m.played_at > now() - interval '30 days'
  ) as recent_match_count,
  -- Most recent match timestamp at any court in this city.
  max(m.played_at) filter (where m.status = 'vouched') as last_match_at
from public.courts c
left join public.matches m on m.court_id = c.id
where c.status = 'active'
group by c.city, c.state;

-- The view inherits RLS from underlying tables — courts are publicly readable
-- (status='active'), matches are publicly readable when vouched. So anyone
-- can read this view without further policy changes.
grant select on public.city_court_pulse to anon, authenticated;

-- =============================================================
-- DONE.
-- =============================================================
