-- アバターの書き込みを admin 以上に限定する
--
-- 背景:
--   avatars バケットのポリシーは org_id 一致しか見ていなかった。
--   一方 Service Layer の updateEmployeeAvatar() は admin 以上を要求している。
--   この食い違いにより、viewer / member でも Supabase Storage API を直接叩けば
--   自組織の全アバターを上書き・削除できた。
--
--     supabase.storage.from('avatars').remove([`${orgId}/${employeeId}/avatar.png`])
--
--   Data API を閉じたのと同じ構図（ADR 0011）だが、Storage はアプリが実際に
--   使っている経路なので「扉ごと閉じる」ことができない。
--
-- 方針:
--   **ここはポリシーにロール制御を持たせる。**
--   ADR 0001 は「ロール別の認可は Service Layer、RLS は org_id だけ」と決めたが、
--   その前提は「DB へ届く経路が Service Layer だけ」であること。
--   Storage はブラウザから直接叩けるため Service Layer が経路上に無く、
--   ポリシーが唯一の実行地点になる。テーブルとは前提が違うので扱いを変える。
--
--   参照は全ロールに開いたままにする。アバターは一覧・詳細に出るもので、
--   閲覧できて困るものではない。

--------------------------------------------------------------------------------
-- 書き込み系ポリシーを貼り替える
--------------------------------------------------------------------------------

drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;

-- JWT の app_metadata.role は custom_access_token_hook が memberships から
-- 埋める（20260815000001）。未所属のユーザーは null になり、どのロールにも
-- 一致しないため書き込みは通らない。
create policy "avatars_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'admin')
  );

create policy "avatars_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'admin')
  );

create policy "avatars_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'org_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'admin')
  );
