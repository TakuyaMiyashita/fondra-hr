-- avatars バケットのポリシーを JWT claim ではなく DB のメンバーシップで判定する
--
-- 背景（security-audit-report.md F-01 / F-05）:
--   20260823000001 の書き込みポリシーは、ロールを
--   `auth.jwt() -> 'app_metadata' ->> 'role'` で、組織を `... ->> 'org_id'` で見ていた。
--   問題は2つあった。
--
--   1) **claim は古くなる（F-05）。** JWT の有効期間（jwt_expiry = 3600）の間は、
--      admin を member に降格しても、メンバーから外しても、手元のトークンは
--      元のロールのまま。Storage API を直接叩けば最大1時間アバターを
--      書き換え・削除でき、除名されたユーザーも同期間は読めた。
--      アプリ本体は ADR 0018 で「ロールの権威は DB」に切り替え済みで、
--      Storage 経路にだけ古い方式が残っていた。
--
--   2) **デモ組織の書き込み禁止が効いていなかった（F-01）。** デモ禁止は
--      Service Layer の authorize()（DEMO_READONLY_ORG_ID）にしか無い。
--      Storage は Service Layer を経由しないため、README で公開している
--      デモの owner / admin でログインした第三者が、デモ組織のアバターを
--      上書き・削除できた。
--
-- 方針:
--   - ロールは public.memberships から引く。security definer のヘルパ関数で
--     auth.uid() と対象組織（パスの1階層目）から現在のロールを返す。
--   - デモ組織かどうかは organizations.is_demo で持つ。ポリシーから参照できる
--     場所に置く必要があり、環境変数（DEMO_READONLY_ORG_ID）は DB から見えない。
--   - 参照は「その組織のメンバーであること」、書き込みは
--     「owner / admin であること かつ デモ組織でないこと」。
--
-- ヘルパを private スキーマに置く理由:
--   public の関数は PostgREST の RPC（/rest/v1/rpc/...）として公開される。
--   Data API は閉じてある（ADR 0011）ので、ポリシー用の関数も扉の外に置く。
--   private は config.toml の api.schemas に含まれないため RPC にならない。
--
-- EXECUTE 権限:
--   ポリシーは呼び出したユーザー（authenticated）の権限で評価されるため、
--   authenticated には EXECUTE が要る。それ以外（public / anon）からは剥がす。
--   service_role は RLS をバイパスするためポリシーを評価せず、付与不要。
--   関数が返すのは「呼び出した本人の、その組織でのロール」と
--   「その組織がデモか」だけで、他人の情報は返さない。

--------------------------------------------------------------------------------
-- 1) デモ組織の印
--------------------------------------------------------------------------------

alter table public.organizations
  add column is_demo boolean not null default false;

-- 公開デモの組織（supabase/seed.sql / docs/deployment.md の DEMO_READONLY_ORG_ID）。
-- ローカルでは seed.sql がマイグレーションの後に流れるため、seed 側でも
-- is_demo = true を入れている。ここは既に行がある環境（本番）向け。
update public.organizations
  set is_demo = true
  where id = 'f0d3a000-0000-4000-8000-000000000001';

--------------------------------------------------------------------------------
-- 2) ポリシー用のヘルパ関数
--------------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- 呼び出したユーザーの、指定組織でのロール。メンバーでなければ null。
--
-- 引数を text で受けるのは、Storage のパス（storage.foldername）が text だから。
-- uuid にキャストすると不正なパスでポリシー評価そのものが例外になるので、
-- 比較側を text に寄せる（memberships は user_id の索引で絞られる）。
create or replace function private.avatar_org_role(p_org_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.user_id = auth.uid()
    and m.org_id::text = p_org_id
  limit 1;
$$;

-- 指定組織がデモ組織か。存在しない組織は false（書き込みはロール判定で落ちる）。
create or replace function private.is_demo_org(p_org_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id::text = p_org_id
      and o.is_demo
  );
$$;

revoke execute on function private.avatar_org_role(text) from public, anon;
revoke execute on function private.is_demo_org(text) from public, anon;
grant execute on function private.avatar_org_role(text) to authenticated;
grant execute on function private.is_demo_org(text) to authenticated;

--------------------------------------------------------------------------------
-- 3) ポリシーを貼り替える
--------------------------------------------------------------------------------

drop policy if exists "avatars_select" on storage.objects;
drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;

-- 参照は全ロール。ただし「今その組織のメンバーであること」を DB で確かめる。
create policy "avatars_select" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_org_role((storage.foldername(name))[1]) is not null
  );

create policy "avatars_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and private.avatar_org_role((storage.foldername(name))[1]) in ('owner', 'admin')
    and not private.is_demo_org((storage.foldername(name))[1])
  );

-- update は using（既存行）と with check（更新後の行）の両方で見る。
-- with check を省くと using が流用されるが、パスの付け替えで別組織へ
-- 移す操作も同じ条件で止まることを明示しておく。
create policy "avatars_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_org_role((storage.foldername(name))[1]) in ('owner', 'admin')
    and not private.is_demo_org((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'avatars'
    and private.avatar_org_role((storage.foldername(name))[1]) in ('owner', 'admin')
    and not private.is_demo_org((storage.foldername(name))[1])
  );

create policy "avatars_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_org_role((storage.foldername(name))[1]) in ('owner', 'admin')
    and not private.is_demo_org((storage.foldername(name))[1])
  );
