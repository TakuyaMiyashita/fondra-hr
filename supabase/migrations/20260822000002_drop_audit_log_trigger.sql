-- DB トリガーによる監査ログの自動記録を撤去する
--
-- 背景:
--   audit_log_trigger() が7テーブルの INSERT/UPDATE/DELETE で発火し、
--   Service Layer の writeAuditLog() とは別に監査ログを1行書いていた。
--   結果、1操作につき監査ログが2行入っていた。
--
--     出所           action             resource_type  actor_user_id
--     Service Layer  employee.create    employee       ctx.userId
--     DB トリガー    create             employees      null
--
--   トリガー側の actor_user_id が常に null なのは、Drizzle が DATABASE_URL の
--   直接接続で来るため auth.uid() が JWT を持たないから。画面上は実行者が
--   「—」の行として出ていた。絞り込みドロップダウンに employee と employees が
--   両方並ぶのも、この二重記録が原因。
--
--   さらに changes に to_jsonb(NEW) を丸ごと入れていたため、
--   employees.birth_date / one_on_ones.notes / evaluations.comment が
--   全列スナップショットとして監査ログに残っていた。監査ログは全ロールが
--   読めるので（認可マトリクス）、src/services/field-visibility.ts の
--   フィールド単位の可視制御がここで完全に打ち消されていた。
--
-- 方針:
--   20260822000001 で Data API を閉じたことにより、DB への書き込み経路は
--   Service Layer だけになった（ADR 0002 と合わせて実効性を持つ）。
--   実行者を記録できず、機微な値を全部抱えるトリガーを残す理由が無い。
--   監査ログの記録は writeAuditLog() に一本化する。
--
--   値そのものの記録は Service Layer 側で伏せる（src/services/audit-log.ts）。
--   監査ログは「誰がいつ何を変えたか」の記録であって、変更後の値の
--   第二の保管場所であってはならない。

--------------------------------------------------------------------------------
-- 1) トリガーを外す
--------------------------------------------------------------------------------

drop trigger if exists audit_departments       on public.departments;
drop trigger if exists audit_employees         on public.employees;
drop trigger if exists audit_skills            on public.skills;
drop trigger if exists audit_employee_skills   on public.employee_skills;
drop trigger if exists audit_one_on_ones       on public.one_on_ones;
drop trigger if exists audit_evaluation_cycles on public.evaluation_cycles;
drop trigger if exists audit_evaluations       on public.evaluations;

--------------------------------------------------------------------------------
-- 2) トリガー関数を落とす
--------------------------------------------------------------------------------

drop function if exists public.audit_log_trigger();

--------------------------------------------------------------------------------
-- 3) 変更禁止トリガーとパージ経路はそのまま残す
--
-- prevent_audit_log_modification() は監査ログの追記専用性を守る本体なので維持する。
-- purge_organization() が立てる app.audit_log_purge フラグも、
-- 組織削除時のカスケード削除を通すために引き続き必要。
--
-- なお 20260818000001 でフラグを導入した理由のうち「カスケード削除中に
-- audit_log_trigger が消えゆく組織へ監査ログを INSERT しようとして
-- FK 違反になる」問題は、トリガーの撤去によって原理的に消えた。
-- prevent_audit_log_modification() 側のフラグ判定だけが引き続き必要。
--------------------------------------------------------------------------------
