-- =============================================================
-- 0024 — sponsor-assets storage bucket + RLS policies
-- =============================================================
-- The unified sponsorship form uploads sponsor logos and prize images to
-- the public `sponsor-assets` bucket. Public buckets allow READ by
-- default, but uploads (storage.objects INSERT) still require an
-- explicit RLS policy. Without one, every admin upload returns
-- "new row violates row-level security policy."
--
-- This migration:
--   1. Creates the bucket if it doesn't already exist (idempotent)
--   2. Adds public-read + admin-write policies on storage.objects
--      scoped to bucket_id = 'sponsor-assets'
-- =============================================================

-- 1. Bucket (idempotent — safe to re-run)
insert into storage.buckets (id, name, public)
values ('sponsor-assets', 'sponsor-assets', true)
on conflict (id) do update set public = true;

-- 2. Policies
drop policy if exists "sponsor-assets public read" on storage.objects;
create policy "sponsor-assets public read"
  on storage.objects for select
  using (bucket_id = 'sponsor-assets');

drop policy if exists "sponsor-assets admin upload" on storage.objects;
create policy "sponsor-assets admin upload"
  on storage.objects for insert
  with check (
    bucket_id = 'sponsor-assets'
    and public.is_current_user_admin()
  );

drop policy if exists "sponsor-assets admin update" on storage.objects;
create policy "sponsor-assets admin update"
  on storage.objects for update
  using (
    bucket_id = 'sponsor-assets'
    and public.is_current_user_admin()
  )
  with check (
    bucket_id = 'sponsor-assets'
    and public.is_current_user_admin()
  );

drop policy if exists "sponsor-assets admin delete" on storage.objects;
create policy "sponsor-assets admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'sponsor-assets'
    and public.is_current_user_admin()
  );

-- =============================================================
-- DONE.
-- =============================================================
