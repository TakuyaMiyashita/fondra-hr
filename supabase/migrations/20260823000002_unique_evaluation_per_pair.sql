-- 同一サイクル・同一の被評価者×評価者の評価が重複しないようにする
--
-- 背景:
--   createEvaluation() は「同じ組み合わせが既にあるか」を SELECT で確かめてから
--   INSERT していたが、DB 側に一意制約が無かった。
--   確認と挿入の間に別のリクエストが入ると、まったく同じ評価が2件できる。
--
--     req A: SELECT → 0件
--     req B: SELECT → 0件
--     req A: INSERT → 成功
--     req B: INSERT → 成功（重複）
--
--   評価一覧に同じ行が2つ並び、どちらを編集したのか分からなくなる。
--   アプリ側のチェックだけでは同時実行を防げないため、DB に制約を置く。
--
-- 既存の重複:
--   検証環境のみの運用（ADR 0005）で、重複が作られた形跡は無い。
--   万一残っていると制約作成が失敗するため、先に古い方を残して削除する。

--------------------------------------------------------------------------------
-- 1) 既存の重複を掃除する（最初の1件だけ残す）
--------------------------------------------------------------------------------

delete from public.evaluations e
using public.evaluations keep
where e.org_id = keep.org_id
  and e.cycle_id = keep.cycle_id
  and e.employee_id = keep.employee_id
  and e.evaluator_id = keep.evaluator_id
  and e.created_at > keep.created_at;

--------------------------------------------------------------------------------
-- 2) 一意制約
--
-- org_id を含めるのは、他の一意制約（employees, skills）と形を揃えるため。
-- cycle_id だけでもテナントは一意に定まるが、制約の読み手が
-- 「テナントを跨いで衝突しないか」を考えずに済む。
--------------------------------------------------------------------------------

alter table public.evaluations
  add constraint evaluations_unique_per_pair
  unique (org_id, cycle_id, employee_id, evaluator_id);
