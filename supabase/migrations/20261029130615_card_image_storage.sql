-- Shared storage for card artwork. Apply only after reviewing the migration.
-- Public reads are needed for card images displayed by the public gallery.
-- Writes and deletes are restricted to the existing UFLMB admin allowlist.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uflmb-card-images',
  'uflmb-card-images',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view UFLMB card images" on storage.objects;
create policy "Public can view UFLMB card images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'uflmb-card-images');

drop policy if exists "UFLMB admins can upload card images" on storage.objects;
create policy "UFLMB admins can upload card images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'uflmb-card-images' and private.is_uflmb_admin());

drop policy if exists "UFLMB admins can update card images" on storage.objects;
create policy "UFLMB admins can update card images"
on storage.objects for update
to authenticated
using (bucket_id = 'uflmb-card-images' and private.is_uflmb_admin())
with check (bucket_id = 'uflmb-card-images' and private.is_uflmb_admin());

drop policy if exists "UFLMB admins can delete card images" on storage.objects;
create policy "UFLMB admins can delete card images"
on storage.objects for delete
to authenticated
using (bucket_id = 'uflmb-card-images' and private.is_uflmb_admin());
