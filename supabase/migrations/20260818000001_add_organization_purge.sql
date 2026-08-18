-- 組織の正規パージ経路を追加する
--
-- 背景:
--   audit_logs は BEFORE UPDATE / BEFORE DELETE トリガーで変更・削除を禁止している。
--   一方 audit_logs.org_id は organizations への ON DELETE CASCADE を持つため、
--   組織を削除しようとするとカスケード削除がトリガーに拒否され、
--   「監査ログが1件でも存在する組織は永久に削除できない」状態になっていた。
--
--     delete from organizations where id = ...;
--     ERROR:  audit_logs cannot be modified or deleted
--
--   解約顧客のデータ削除ができないため、実運用で問題になる。
--
-- 方針:
--   監査ログの不変性は維持したまま、明示的なパージ操作のときだけ
--   カスケード削除を通す。UPDATE は引き続き常に禁止する。

--------------------------------------------------------------------------------
-- 1) 変更禁止トリガー: 明示的なパージ中の DELETE のみ許可する
--------------------------------------------------------------------------------

create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
as $$
begin
  -- UPDATE は常に禁止。監査ログは追記専用であり、書き換えは認めない。
  -- DELETE は purge_organization() が立てるフラグがある場合に限り通す。
  if TG_OP = 'DELETE'
     and coalesce(current_setting('app.audit_log_purge', true), 'off') = 'on' then
    return OLD;
  end if;

  raise exception 'audit_logs cannot be modified or deleted';
end;
$$;

--------------------------------------------------------------------------------
-- 2) 監査記録トリガー: パージ中は記録しない
--
-- 組織を削除すると各ドメインテーブルへカスケード削除が波及し、その1行ごとに
-- audit_log_trigger が「削除された」という監査ログを INSERT しようとする。
-- しかし書き込み先の org_id は今まさに消える組織であり、
-- audit_logs_org_id_fkey に違反して削除全体が失敗する。
--
--   ERROR:  insert or update on table "audit_logs" violates foreign key constraint
--   DETAIL: Key (org_id)=(...) is not present in table "organizations".
--
-- 組織ごと消える以上その監査ログを残す先も無いため、パージ中は記録を行わない。
--------------------------------------------------------------------------------

create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.audit_log_purge', true), 'off') = 'on' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if TG_OP = 'INSERT' then
    insert into public.audit_logs (org_id, actor_user_id, action, resource_type, resource_id, changes)
    values (NEW.org_id, auth.uid(), 'create', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('new', to_jsonb(NEW)));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_logs (org_id, actor_user_id, action, resource_type, resource_id, changes)
    values (NEW.org_id, auth.uid(), 'update', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_logs (org_id, actor_user_id, action, resource_type, resource_id, changes)
    values (OLD.org_id, auth.uid(), 'delete', TG_TABLE_NAME, OLD.id,
            jsonb_build_object('old', to_jsonb(OLD)));
    return OLD;
  end if;
  return null;
end;
$$;

--------------------------------------------------------------------------------
-- 3) 組織のパージ関数
--
-- set_config の第3引数 true はトランザクションローカル指定。
-- 関数を抜けた時点（トランザクション終了時）に自動で元に戻るため、
-- フラグが立ちっぱなしになることはない。
--------------------------------------------------------------------------------

create or replace function public.purge_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.audit_log_purge', 'on', true);

  -- organizations の削除は各ドメインテーブルへ ON DELETE CASCADE で波及する
  delete from public.organizations where id = p_org_id;

  perform set_config('app.audit_log_purge', 'off', true);
end;
$$;

--------------------------------------------------------------------------------
-- 4) 権限
--
-- authenticated には organizations / audit_logs いずれも DELETE を GRANT して
-- おらず、削除を許す RLS ポリシーも無い。パージ関数も service_role 専用とし、
-- アプリのエンドユーザーからは到達できないようにする。
--------------------------------------------------------------------------------

revoke execute on function public.purge_organization(uuid) from public, anon, authenticated;
grant execute on function public.purge_organization(uuid) to service_role;
