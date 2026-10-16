-- Private storage bucket for user profile photos.
-- Each user can only read and write objects inside their own auth.uid() folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
   'tw-profile-avatars',
   'tw-profile-avatars',
   false,
   2097152,
   array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy tw_avatars_select_own
on storage.objects for select to authenticated
using (
   bucket_id = 'tw-profile-avatars'
   and (storage.foldername(name))[1] = auth.uid()::text
);

create policy tw_avatars_insert_own
on storage.objects for insert to authenticated
with check (
   bucket_id = 'tw-profile-avatars'
   and (storage.foldername(name))[1] = auth.uid()::text
);

create policy tw_avatars_update_own
on storage.objects for update to authenticated
using (
   bucket_id = 'tw-profile-avatars'
   and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
   bucket_id = 'tw-profile-avatars'
   and (storage.foldername(name))[1] = auth.uid()::text
);

create policy tw_avatars_delete_own
on storage.objects for delete to authenticated
using (
   bucket_id = 'tw-profile-avatars'
   and (storage.foldername(name))[1] = auth.uid()::text
);
