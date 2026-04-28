-- =============================================================
-- 0009 — Storage policies for the "avatars" bucket
-- =============================================================
-- Run AFTER manually creating the bucket in the Supabase Dashboard:
--   Storage → New bucket → name: "avatars" → Public bucket: ON → Save
--
-- These policies let any authenticated user upload to / update / delete
-- files in their OWN folder (named after their players.id), and let anyone
-- READ files (so avatars render publicly).
-- =============================================================

-- Public read access on the avatars bucket
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated users can upload to a folder matching their player id
drop policy if exists "avatars upload to own folder" on storage.objects;
create policy "avatars upload to own folder" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (
      select id::text from public.players where auth_user_id = auth.uid()
    )
  );

-- Authenticated users can update files in their own folder
drop policy if exists "avatars update own folder" on storage.objects;
create policy "avatars update own folder" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (
      select id::text from public.players where auth_user_id = auth.uid()
    )
  );

-- Authenticated users can delete files in their own folder
drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars delete own folder" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (
      select id::text from public.players where auth_user_id = auth.uid()
    )
  );

-- =============================================================
-- DONE.
-- =============================================================
