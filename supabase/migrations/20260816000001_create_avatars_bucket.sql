-- アバター画像用の Storage バケット作成
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152, -- 2MB
  array['image/jpeg', 'image/png', 'image/webp']
);

-- パス規約: {org_id}/{employee_id}/{filename}
-- テナント分離: フォルダ名の1階層目が org_id であることを検証

-- 認証済みユーザーが自テナントのアバターを読み取り可能
create policy "avatars_select" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );

-- 認証済みユーザーが自テナントのアバターをアップロード可能
create policy "avatars_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );

-- 認証済みユーザーが自テナントのアバターを更新可能
create policy "avatars_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );

-- 認証済みユーザーが自テナントのアバターを削除可能
create policy "avatars_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
  );
