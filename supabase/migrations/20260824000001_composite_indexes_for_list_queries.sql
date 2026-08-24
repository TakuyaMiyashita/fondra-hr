-- 一覧クエリの形に合わせた複合索引に置き換える
--
-- 背景:
--   一覧はどれも「org_id で絞る → 日付で並べる → ページングする」形をしている。
--   ところが索引は org_id と日付が別々に張られていた。この形だと Postgres は
--   どちらか一方しか使えず、
--
--     - 日付索引を選ぶと、他テナントの行を大量に読み飛ばす
--     - org_id 索引を選ぶと、取ってきた行をソートし直す
--
--   のどちらかになる。org_id と並び順を1本にまとめると、索引を読む順序が
--   そのまま出力順になり、ソートも読み飛ばしも消える。
--
-- 計測（ローカル / 20テナントに分散させたデータ / 1ページ目 20件）:
--
--   audit_logs 20万件
--     変更前: 0.773ms / 364 buffers（Incremental Sort + 他テナント330行を破棄）
--     変更後: 0.105ms /  23 buffers（Index Scan のみ）
--
--   one_on_ones 6千件
--     変更前: 0.383ms / 695 buffers（Incremental Sort）
--     変更後: 0.033ms /  21 buffers（Index Scan のみ）
--
--   テナント数が増えるほど差は開く。とくに audit_logs は全ミューテーションで
--   1行増え続け、消せない（追記専用）ため、放置すると一覧が最初に重くなる。
--
-- employees は対象にしない:
--   既定の並びは created_at だが、一覧は7つの列で並べ替えられる。
--   複合索引が効くのは1つだけで、計測しても改善は 0.165ms → 0.026ms と小さく、
--   buffers はむしろ増えた（11 → 18）。書き込みコストに見合わない。

--------------------------------------------------------------------------------
-- audit_logs
--------------------------------------------------------------------------------

create index idx_audit_logs_org_created on public.audit_logs (org_id, created_at desc, id);

-- 置き換え元。org_id は複合索引の先頭列なので単独索引は不要になる。
drop index if exists public.idx_audit_logs_org_id;

-- created_at 単独の索引を使うクエリ（org_id で絞らない一覧）はアプリに無い。
-- listAuditLogs / getRecentActivity はどちらも org_id で絞っている。
drop index if exists public.idx_audit_logs_created_at;

--------------------------------------------------------------------------------
-- one_on_ones
--------------------------------------------------------------------------------

create index idx_one_on_ones_org_held on public.one_on_ones (org_id, held_on desc, id);

drop index if exists public.idx_one_on_ones_org_id;

-- held_on 単独の索引は employee_risk_scores ビューが使うかを確認したうえで落とす。
-- 実際には employee_id 側の索引とハッシュ結合で処理されており、
-- 落としても実行計画は変わらなかった。
drop index if exists public.idx_one_on_ones_held_on;
