-- Data API（PostgREST / GraphQL）を anon / authenticated から閉じる
--
-- 背景:
--   認可（ロール × リソース × 操作）は Service Layer にしか無い（ADR 0001）。
--   一方で全ドメインテーブルに `grant ... to authenticated` が付いており、
--   Data API が有効（supabase/config.toml の schemas = ["public"]）なため、
--   ログイン中のユーザーは Service Layer を通さずに直接テーブルを叩けた。
--   anon キーはクライアントバンドルに載り、アクセストークンはブラウザから読める。
--
--   RLS は org_id 一致しか見ないので、この経路では以下がロールに関係なく通る:
--
--     PATCH /rest/v1/memberships?user_id=eq.<自分>  {"role":"owner"}
--       → 次のトークン更新で custom_access_token_hook が読み直し、
--         JWT の role が owner になる。組織の完全掌握。
--     GET  /rest/v1/employees?select=birth_date      → 全員の生年月日
--     GET  /rest/v1/one_on_ones?select=notes         → 全件の面談メモ
--     GET  /rest/v1/evaluations?select=comment       → 全評価コメント
--     DELETE /rest/v1/employees                      → 従業員全件削除
--
--   src/services/field-visibility.ts と src/services/self.ts の制御は
--   すべてこの経路で無効化されていた。
--
-- 方針:
--   アプリは Data API を DB アクセスに使っていない。Supabase JS の用途は
--   Auth と Storage に限定され（ADR 0002）、DB は Drizzle の直接接続のみ。
--   使っていない扉なので、塞ぐ。
--
--   RLS ポリシーは残す。剥がすと将来 grant を戻したときに無防備になるため。

--------------------------------------------------------------------------------
-- 1) 全テーブル・ビューの権限を剥奪する
--------------------------------------------------------------------------------

revoke all on public.organizations        from anon, authenticated;
revoke all on public.memberships          from anon, authenticated;
revoke all on public.invitations          from anon, authenticated;
revoke all on public.departments          from anon, authenticated;
revoke all on public.employees            from anon, authenticated;
revoke all on public.skills               from anon, authenticated;
revoke all on public.employee_skills      from anon, authenticated;
revoke all on public.one_on_ones          from anon, authenticated;
revoke all on public.evaluation_cycles    from anon, authenticated;
revoke all on public.evaluations          from anon, authenticated;
revoke all on public.audit_logs           from anon, authenticated;
revoke all on public.employee_risk_scores from anon, authenticated;

--------------------------------------------------------------------------------
-- 2) 今後追加されるテーブルも自動では露出させない
--
-- supabase/config.toml の auto_expose_new_tables は既定で無効だが、
-- default privileges 側にも明示しておく。新しいテーブルを足した人が
-- 何もしなくても閉じている状態を既定にするため。
--------------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

--------------------------------------------------------------------------------
-- 3) 残す権限
--
-- - service_role: 変更なし（RLS をバイパスするが、e2e の前提データ投入と
--   purge_organization() に必要）
-- - supabase_auth_admin: memberships の SELECT。JWT フック
--   custom_access_token_hook() が読むため、これを落とすとログインが壊れる
-- - current_org_id(): RLS ポリシーが参照する。grant を戻したときのために残す
--------------------------------------------------------------------------------

grant select on public.memberships to supabase_auth_admin;
