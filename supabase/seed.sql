--------------------------------------------------------------------------------
-- FondraHR デモシードデータ
--
-- `supabase db reset` 時に自動実行される（supabase/config.toml の [db.seed]）。
-- ローカル開発・デモ・スクリーンショット用。
--
-- 検証環境（README がデモ環境として案内している先）にも psql で明示的に流す。
-- `supabase db push` は migrations/ しか適用しないため、この手順を踏まないと
-- README 記載のアカウントが存在しない。手順は docs/deployment.md。
-- 冒頭で purge_organization を呼ぶので何度実行してもよい。
--
-- 生成されるもの:
--   - 組織 1件（株式会社フォンドラ）
--   - ログイン可能なユーザー 3名（owner / admin / member）
--   - 部署 12件（2階層）/ 従業員 30名 / スキル 22件
--   - スキル割当・1on1・評価サイクル2期分・監査ログ
--
-- 日付はすべて current_date からの相対で生成するため、いつ実行しても
-- 「直近90日の1on1」「進行中の評価サイクル」が成立する。
--
-- ログイン情報:
--   owner@fondra.example.com   / demo-password123  (owner)
--   hr@fondra.example.com      / demo-password123  (admin)
--   manager@fondra.example.com / demo-password123  (member)
--------------------------------------------------------------------------------

begin;

--------------------------------------------------------------------------------
-- 監査ログについて
--
-- 監査ログの記録は Service Layer の writeAuditLog() に一本化されており
-- （20260822000002 でドメインテーブルの監査トリガを撤去した）、
-- シード投入では監査ログは発生しない。デモとして意味のある監査ログは
-- 最後に手で投入する。
--
-- audit_logs の変更禁止トリガは健在。再実行時のクリーンアップには
-- 正規のパージ経路（purge_organization）を使う。
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 決定的な擬似乱数ヘルパー
--
-- md5 の先頭 24bit を整数化する。bit(24) は最大 16,777,215 なので常に非負。
-- 同じ入力文字列からは常に同じ値が出るため、シードの再現性が保たれる。
--------------------------------------------------------------------------------

create or replace function pg_temp.h(seed text)
returns int
language sql
immutable
as $$
  select ('x' || substr(md5(seed), 1, 6))::bit(24)::int;
$$;

--------------------------------------------------------------------------------
-- 再実行時のクリーンアップ
--------------------------------------------------------------------------------

-- 組織の削除は監査ログへカスケードするため、purge_organization を経由する。
-- 直接 delete すると audit_logs の変更禁止トリガに拒否される。
select public.purge_organization(id) from public.organizations where slug = 'fondra-demo';
delete from auth.users where email like '%@fondra.example.com';

--------------------------------------------------------------------------------
-- 認証ユーザー
--
-- パスワードログインには auth.users と auth.identities の両方が必要。
--
-- confirmation_token / recovery_token / email_change_token_new / email_change は
-- DB 側にデフォルトが無く NULL になるが、GoTrue はこれらを非 NULL 文字列として
-- 読み込むため、NULL のままだとログイン時に
-- 「Database error querying schema」(500) で失敗する。必ず空文字を入れる。
--------------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '2f9a1c00-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'owner@fondra.example.com',
    extensions.crypt('demo-password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"佐藤 健一"}'::jsonb,
    '', '', '', '',
    now() - interval '400 days', now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2f9a1c00-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'hr@fondra.example.com',
    extensions.crypt('demo-password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"鈴木 美咲"}'::jsonb,
    '', '', '', '',
    now() - interval '300 days', now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '2f9a1c00-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    'manager@fondra.example.com',
    extensions.crypt('demo-password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"高橋 誠"}'::jsonb,
    '', '', '', '',
    now() - interval '250 days', now()
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), u.created_at, now()
from auth.users u
where u.email like '%@fondra.example.com';

--------------------------------------------------------------------------------
-- 組織とメンバーシップ
--------------------------------------------------------------------------------

insert into public.organizations (id, name, slug, plan, created_at)
values (
  'f0d3a000-0000-4000-8000-000000000001',
  '株式会社フォンドラ',
  'fondra-demo',
  'pro',
  now() - interval '400 days'
);

insert into public.memberships (user_id, org_id, role, created_at)
values
  ('2f9a1c00-0000-4000-8000-000000000001', 'f0d3a000-0000-4000-8000-000000000001', 'owner',  now() - interval '400 days'),
  ('2f9a1c00-0000-4000-8000-000000000002', 'f0d3a000-0000-4000-8000-000000000001', 'admin',  now() - interval '300 days'),
  ('2f9a1c00-0000-4000-8000-000000000003', 'f0d3a000-0000-4000-8000-000000000001', 'member', now() - interval '250 days');

-- 招待の保留中サンプル（設定 > メンバー画面の表示確認用）
insert into public.invitations (org_id, email, role, expires_at, created_at)
values (
  'f0d3a000-0000-4000-8000-000000000001',
  'newcomer@fondra.example.com',
  'member',
  now() + interval '5 days',
  now() - interval '2 days'
);

--------------------------------------------------------------------------------
-- 部署（2階層）
--------------------------------------------------------------------------------

insert into public.departments (org_id, name, parent_id)
select 'f0d3a000-0000-4000-8000-000000000001', name, null
from (values ('経営本部'), ('開発本部'), ('営業本部'), ('コーポレート本部')) as v(name);

insert into public.departments (org_id, name, parent_id)
select 'f0d3a000-0000-4000-8000-000000000001', v.name, p.id
from (values
  ('経営企画部',       '経営本部'),
  ('プロダクト開発部', '開発本部'),
  ('プラットフォーム部', '開発本部'),
  ('QA部',             '開発本部'),
  ('営業一部',         '営業本部'),
  ('営業二部',         '営業本部'),
  ('人事部',           'コーポレート本部'),
  ('経理部',           'コーポレート本部')
) as v(name, parent)
join public.departments p
  on p.org_id = 'f0d3a000-0000-4000-8000-000000000001'
 and p.name = v.parent;

--------------------------------------------------------------------------------
-- 従業員
--------------------------------------------------------------------------------

-- created_at は登録日として一覧のデフォルトソートに使われる。
-- 一括 INSERT だと全件同値になり、実データらしくないうえ
-- 「同値が並ぶ状態」を目視で検証できなくなるため、意図的にばらす。
insert into public.employees (
  org_id, department_id, employee_code, full_name, full_name_kana,
  email, position, hired_on, birth_date, status, created_at, updated_at
)
select
  'f0d3a000-0000-4000-8000-000000000001',
  d.id,
  v.code, v.full_name, v.kana, v.email, v.position,
  current_date - v.tenure_days,
  current_date - v.age_days,
  v.status,
  now() - (pg_temp.h(v.code || 'registered') % 380 + 5) * interval '1 day',
  now() - (pg_temp.h(v.code || 'registered') % 380 + 5) * interval '1 day'
from (values
  -- 経営企画部
  ('EMP-001','山田 太一','ヤマダ タイチ','yamada@fondra.example.com','執行役員','経営企画部',3200,18600,'active'),
  ('EMP-002','中村 彩','ナカムラ アヤ','nakamura@fondra.example.com','経営企画マネージャー','経営企画部',1800,14200,'active'),
  -- プロダクト開発部
  ('EMP-003','高橋 誠','タカハシ マコト','manager@fondra.example.com','開発本部長','プロダクト開発部',2900,16800,'active'),
  ('EMP-004','伊藤 拓也','イトウ タクヤ','ito@fondra.example.com','テックリード','プロダクト開発部',1500,13100,'active'),
  ('EMP-005','渡辺 由紀','ワタナベ ユキ','watanabe@fondra.example.com','シニアエンジニア','プロダクト開発部',900,12400,'active'),
  ('EMP-006','小林 直樹','コバヤシ ナオキ','kobayashi@fondra.example.com','エンジニア','プロダクト開発部',400,10900,'active'),
  ('EMP-007','加藤 涼','カトウ リョウ','kato@fondra.example.com','エンジニア','プロダクト開発部',180,9600,'active'),
  ('EMP-008','吉田 千尋','ヨシダ チヒロ','yoshida@fondra.example.com','UIデザイナー','プロダクト開発部',1100,12900,'active'),
  -- プラットフォーム部
  ('EMP-009','山本 大輔','ヤマモト ダイスケ','yamamoto@fondra.example.com','部長','プラットフォーム部',2400,15600,'active'),
  ('EMP-010','松本 圭','マツモト ケイ','matsumoto@fondra.example.com','SRE','プラットフォーム部',1300,13400,'active'),
  ('EMP-011','井上 奈々','イノウエ ナナ','inoue@fondra.example.com','SRE','プラットフォーム部',600,11700,'active'),
  ('EMP-012','木村 隼人','キムラ ハヤト','kimura@fondra.example.com','インフラエンジニア','プラットフォーム部',250,10200,'active'),
  ('EMP-013','林 美和','ハヤシ ミワ','hayashi@fondra.example.com','データエンジニア','プラットフォーム部',800,12100,'active'),
  -- QA部
  ('EMP-014','清水 亮','シミズ リョウ','shimizu@fondra.example.com','QAリード','QA部',1700,14500,'active'),
  ('EMP-015','斎藤 花','サイトウ ハナ','saito@fondra.example.com','QAエンジニア','QA部',500,11200,'active'),
  ('EMP-016','森 健太','モリ ケンタ','mori@fondra.example.com','QAエンジニア','QA部',150,9900,'active'),
  -- 営業一部
  ('EMP-017','池田 学','イケダ マナブ','ikeda@fondra.example.com','営業本部長','営業一部',3000,17200,'active'),
  ('EMP-018','橋本 遥','ハシモト ハルカ','hashimoto@fondra.example.com','営業マネージャー','営業一部',1600,13800,'active'),
  ('EMP-019','石川 悠斗','イシカワ ユウト','ishikawa@fondra.example.com','セールス','営業一部',700,11500,'active'),
  ('EMP-020','前田 沙織','マエダ サオリ','maeda@fondra.example.com','セールス','営業一部',300,10500,'active'),
  -- 営業二部
  ('EMP-021','藤田 康平','フジタ コウヘイ','fujita@fondra.example.com','営業マネージャー','営業二部',1400,14000,'active'),
  ('EMP-022','岡田 里奈','オカダ リナ','okada@fondra.example.com','セールス','営業二部',550,11300,'active'),
  ('EMP-023','後藤 翔','ゴトウ ショウ','goto@fondra.example.com','セールス','営業二部',120,9700,'active'),
  -- 人事部
  ('EMP-024','佐藤 健一','サトウ ケンイチ','owner@fondra.example.com','人事部長','人事部',2600,16100,'active'),
  ('EMP-025','鈴木 美咲','スズキ ミサキ','hr@fondra.example.com','人事マネージャー','人事部',1200,13600,'active'),
  ('EMP-026','村上 陽子','ムラカミ ヨウコ','murakami@fondra.example.com','人事担当','人事部',350,10800,'active'),
  -- 経理部
  ('EMP-027','近藤 修','コンドウ オサム','kondo@fondra.example.com','経理部長','経理部',2200,15900,'active'),
  ('EMP-028','原田 彩香','ハラダ アヤカ','harada@fondra.example.com','経理担当','経理部',650,11900,'active'),
  -- 在籍状況のバリエーション
  ('EMP-029','三浦 京子','ミウラ キョウコ','miura@fondra.example.com','エンジニア','プロダクト開発部',1900,14800,'retired'),
  ('EMP-030','大野 智也','オオノ トモヤ','ono@fondra.example.com','エンジニア','プラットフォーム部',1000,12600,'inactive')
) as v(code, full_name, kana, email, position, dept, tenure_days, age_days, status)
join public.departments d
  on d.org_id = 'f0d3a000-0000-4000-8000-000000000001'
 and d.name = v.dept;

-- ログインユーザーと従業員レコードの紐付け
update public.employees e
set user_id = u.id
from auth.users u
where e.org_id = 'f0d3a000-0000-4000-8000-000000000001'
  and e.email = u.email;

--------------------------------------------------------------------------------
-- スキルマスタ
--------------------------------------------------------------------------------

insert into public.skills (org_id, name, category)
select 'f0d3a000-0000-4000-8000-000000000001', name, category
from (values
  ('React',           'フロントエンド'),
  ('TypeScript',      'フロントエンド'),
  ('Next.js',         'フロントエンド'),
  ('CSS / Tailwind',  'フロントエンド'),
  ('Node.js',         'バックエンド'),
  ('Go',              'バックエンド'),
  ('Python',          'バックエンド'),
  ('PostgreSQL',      'バックエンド'),
  ('API設計',         'バックエンド'),
  ('AWS',             'インフラ'),
  ('Docker / Kubernetes', 'インフラ'),
  ('Terraform',       'インフラ'),
  ('CI/CD',           'インフラ'),
  ('SQL分析',         'データ'),
  ('データ基盤構築',  'データ'),
  ('機械学習',        'データ'),
  ('UIデザイン',      'デザイン'),
  ('UXリサーチ',      'デザイン'),
  ('提案営業',        'ビジネス'),
  ('折衝・交渉',      'ビジネス'),
  ('採用面接',        'ビジネス'),
  ('プロジェクト管理','ビジネス')
) as v(name, category);

--------------------------------------------------------------------------------
-- スキル割当
--
-- 部署とスキルカテゴリの関連度に応じて、決定的に割り当てる。
-- （エンジニアに「提案営業」が付くようなノイズを避ける）
--
-- updated_at は従業員ごとに 0〜18ヶ月前へ意図的にばらす。
-- employee_risk_scores ビューは「スキル情報の最終更新日」をリスク要素の
-- ひとつとして見ているため、ここが全件 now() だと全員のリスクが
-- 低く出てしまい、ダッシュボードのリスク分布が成立しない。
--------------------------------------------------------------------------------

insert into public.employee_skills (
  org_id, employee_id, skill_id, level, certified_at, created_at, updated_at
)
select
  'f0d3a000-0000-4000-8000-000000000001',
  e.id,
  s.id,
  1 + (pg_temp.h(e.employee_code || s.name || 'lv') % 5),
  case
    when pg_temp.h(e.employee_code || s.name || 'cert') % 3 = 0
      then current_date - (pg_temp.h(e.employee_code || s.name || 'cd') % 900)
    else null
  end,
  now() - (pg_temp.h(e.employee_code || 'skill-age') % 540 + 60) * interval '1 day',
  now() - (pg_temp.h(e.employee_code || 'skill-age') % 540) * interval '1 day'
from public.employees e
join public.departments d on d.id = e.department_id
join public.skills s on s.org_id = e.org_id
join (values
  ('プロダクト開発部',   'フロントエンド'),
  ('プロダクト開発部',   'バックエンド'),
  ('プロダクト開発部',   'デザイン'),
  ('プラットフォーム部', 'インフラ'),
  ('プラットフォーム部', 'バックエンド'),
  ('プラットフォーム部', 'データ'),
  ('QA部',               'バックエンド'),
  ('QA部',               'インフラ'),
  ('QA部',               'フロントエンド'),
  ('営業一部',           'ビジネス'),
  ('営業一部',           'データ'),
  ('営業二部',           'ビジネス'),
  ('経営企画部',         'ビジネス'),
  ('経営企画部',         'データ'),
  ('人事部',             'ビジネス'),
  ('経理部',             'ビジネス'),
  ('経理部',             'データ')
) as rel(dept, category)
  on rel.dept = d.name and rel.category = s.category
where e.org_id = 'f0d3a000-0000-4000-8000-000000000001'
  and pg_temp.h(e.employee_code || s.name || 'has') % 100 < 55;

--------------------------------------------------------------------------------
-- 1on1 記録
--
-- 従業員ごとに 1〜6 回、直近 0〜120 日を起点に約2週間間隔で生成する。
-- 起点をずらすことで「直近90日に1on1がない従業員」が生まれ、
-- employee_risk_scores ビューのリスク判定に低〜高のばらつきが出る。
--------------------------------------------------------------------------------

insert into public.one_on_ones (
  org_id, employee_id, interviewer_id, held_on, notes, mood_score, created_at, updated_at
)
with mgr as (
  -- 各部署の最若番社員をその部署の面談者とみなす
  select distinct on (department_id) department_id, id
  from public.employees
  where org_id = 'f0d3a000-0000-4000-8000-000000000001' and status = 'active'
  order by department_id, employee_code
),
hr_head as (
  select id from public.employees
  where org_id = 'f0d3a000-0000-4000-8000-000000000001' and employee_code = 'EMP-024'
)
select
  'f0d3a000-0000-4000-8000-000000000001',
  e.id,
  coalesce(nullif(m.id, e.id), (select id from hr_head)),
  d.held_on,
  (array[
    '今期の目標進捗を確認。予定どおり進んでおり、大きな懸念はない。',
    '担当プロジェクトの負荷が高い状態が続いている。次スプリントでタスクの再配分を検討する。',
    'キャリアの方向性について相談。マネジメントよりも専門性を深めたい意向を確認した。',
    '新しく参画したメンバーのオンボーディング支援について前向きな発言があった。',
    '前回設定したアクションアイテムは完了済み。次の目標設定を合意した。',
    '他部署との連携で認識齟齬が発生していた件をフォロー。すでに解消済みとのこと。'
  ])[1 + (pg_temp.h(e.employee_code || g::text || 'note') % 6)],
  case
    when pg_temp.h(e.employee_code || g::text || 'mood') % 9 = 0 then null
    else 2 + (pg_temp.h(e.employee_code || g::text || 'mood') % 4)
  end,
  -- 記録日時は面談実施日の夕方とみなす（作成日時が全件同値になるのを避ける）
  d.held_on + interval '18 hours',
  d.held_on + interval '18 hours'
from public.employees e
join mgr m on m.department_id = e.department_id
cross join generate_series(0, 5) as g
cross join lateral (
  select (current_date
    - (pg_temp.h(e.employee_code || 'offset') % 120)
    - (14 * g)
    - (pg_temp.h(e.employee_code || g::text || 'jitter') % 6))::date as held_on
) as d
where e.org_id = 'f0d3a000-0000-4000-8000-000000000001'
  and e.status = 'active'
  and g <= (pg_temp.h(e.employee_code || 'count') % 6);

--------------------------------------------------------------------------------
-- 評価サイクル（前期=完了 / 当期=進行中）
--
-- 期は 4/1 と 10/1 始まりの半期。current_date が属する半期を「当期」とする。
--------------------------------------------------------------------------------

insert into public.evaluation_cycles (id, org_id, name, period_start, period_end, status)
with periods as (
  select
    case
      when extract(month from current_date) >= 10
        then make_date(extract(year from current_date)::int, 10, 1)
      when extract(month from current_date) >= 4
        then make_date(extract(year from current_date)::int, 4, 1)
      else make_date(extract(year from current_date)::int - 1, 10, 1)
    end as cur_start
),
both_periods as (
  select cur_start, (cur_start - interval '6 months')::date as prev_start from periods
)
select
  v.id,
  'f0d3a000-0000-4000-8000-000000000001',
  to_char(v.start_date, 'YYYY') || '年'
    || case when extract(month from v.start_date) = 4 then '上期' else '下期' end
    || '評価',
  v.start_date,
  (v.start_date + interval '6 months' - interval '1 day')::date,
  v.status
from both_periods b
cross join lateral (values
  ('ec000000-0000-4000-8000-000000000001'::uuid, b.prev_start, 'completed'),
  ('ec000000-0000-4000-8000-000000000002'::uuid, b.cur_start,  'in_progress')
) as v(id, start_date, status);

-- 前期: 全在籍者が確定済み
insert into public.evaluations (
  org_id, cycle_id, employee_id, evaluator_id, ratings, comment, status, created_at, updated_at
)
with mgr as (
  select distinct on (department_id) department_id, id
  from public.employees
  where org_id = 'f0d3a000-0000-4000-8000-000000000001' and status = 'active'
  order by department_id, employee_code
),
hr_head as (
  select id from public.employees
  where org_id = 'f0d3a000-0000-4000-8000-000000000001' and employee_code = 'EMP-024'
)
select
  'f0d3a000-0000-4000-8000-000000000001',
  'ec000000-0000-4000-8000-000000000001',
  e.id,
  coalesce(nullif(m.id, e.id), (select id from hr_head)),
  jsonb_build_object(
    'performance', 2 + (pg_temp.h(e.employee_code || 'prev-p') % 4),
    'competency',  2 + (pg_temp.h(e.employee_code || 'prev-c') % 4),
    'attitude',    2 + (pg_temp.h(e.employee_code || 'prev-a') % 4)
  ),
  (array[
    '期初に設定した目標をすべて達成した。特に品質面での貢献が大きい。',
    '担当領域の成果は安定している。次期は後進の育成にも期待したい。',
    '難易度の高い課題に粘り強く取り組み、期待を上回る成果を出した。',
    '成果は目標水準に到達。周囲との連携をさらに強めることで一段の伸長が見込める。',
    '新しい領域へのキャッチアップが速く、チームへの好影響が大きかった。'
  ])[1 + (pg_temp.h(e.employee_code || 'prev-cm') % 5)],
  'confirmed',
  now() - (180 + pg_temp.h(e.employee_code || 'prev-at') % 30) * interval '1 day',
  now() - (180 + pg_temp.h(e.employee_code || 'prev-at') % 30) * interval '1 day'
from public.employees e
join mgr m on m.department_id = e.department_id
where e.org_id = 'f0d3a000-0000-4000-8000-000000000001'
  and e.status = 'active';

-- 当期: 進行中（ステータスがばらついている状態）
insert into public.evaluations (
  org_id, cycle_id, employee_id, evaluator_id, ratings, comment, status, created_at, updated_at
)
with mgr as (
  select distinct on (department_id) department_id, id
  from public.employees
  where org_id = 'f0d3a000-0000-4000-8000-000000000001' and status = 'active'
  order by department_id, employee_code
),
hr_head as (
  select id from public.employees
  where org_id = 'f0d3a000-0000-4000-8000-000000000001' and employee_code = 'EMP-024'
)
select
  'f0d3a000-0000-4000-8000-000000000001',
  'ec000000-0000-4000-8000-000000000002',
  e.id,
  coalesce(nullif(m.id, e.id), (select id from hr_head)),
  case
    when pg_temp.h(e.employee_code || 'cur-st') % 4 = 0 then null
    else jsonb_build_object(
      'performance', 2 + (pg_temp.h(e.employee_code || 'cur-p') % 4),
      'competency',  2 + (pg_temp.h(e.employee_code || 'cur-c') % 4),
      'attitude',    2 + (pg_temp.h(e.employee_code || 'cur-a') % 4)
    )
  end,
  case
    when pg_temp.h(e.employee_code || 'cur-st') % 4 = 0 then null
    else '中間時点での進捗は良好。期末に向けて目標の再確認を行った。'
  end,
  (array['draft', 'in_progress', 'submitted', 'returned'])[
    1 + (pg_temp.h(e.employee_code || 'cur-st') % 4)
  ],
  now() - (pg_temp.h(e.employee_code || 'cur-at') % 45 + 3) * interval '1 day',
  now() - (pg_temp.h(e.employee_code || 'cur-at') % 45 + 3) * interval '1 day'
from public.employees e
join mgr m on m.department_id = e.department_id
where e.org_id = 'f0d3a000-0000-4000-8000-000000000001'
  and e.status = 'active';

--------------------------------------------------------------------------------
-- 監査ログ
--
-- Service Layer が書き込む形式に合わせる:
--   action        = '<resource>.<verb>'      例: employee.update
--   resource_type = 単数形                    例: employee
--   changes       = { field: { from, to } }  （更新時）
--
-- 直近30日にばらして投入し、監査ログ画面のフィルタ・時系列表示を確認できるようにする。
--------------------------------------------------------------------------------

insert into public.audit_logs (
  org_id, actor_user_id, action, resource_type, resource_id, changes, ip, created_at
)
select
  'f0d3a000-0000-4000-8000-000000000001',
  (array[
    '2f9a1c00-0000-4000-8000-000000000001'::uuid,
    '2f9a1c00-0000-4000-8000-000000000002'::uuid,
    '2f9a1c00-0000-4000-8000-000000000003'::uuid
  ])[1 + (pg_temp.h(e.employee_code || 'actor') % 3)],
  t.resource || '.' || t.verb,
  t.resource,
  e.id,
  t.changes,
  '203.0.113.' || (1 + (pg_temp.h(e.employee_code || 'ip') % 250))::text,
  now()
    - (pg_temp.h(e.employee_code || t.verb || 'day') % 30) * interval '1 day'
    - (pg_temp.h(e.employee_code || t.verb || 'sec') % 86400) * interval '1 second'
from public.employees e
cross join lateral (values
  (
    'employee', 'update',
    jsonb_build_object(
      'position', jsonb_build_object('from', '担当', 'to', e.position),
      'departmentId', jsonb_build_object('from', null, 'to', e.department_id)
    )
  ),
  (
    'employee', 'create',
    jsonb_build_object('employeeCode', e.employee_code, 'fullName', e.full_name)
  ),
  (
    'one_on_one', 'create',
    jsonb_build_object('employeeId', e.id, 'heldOn', to_char(current_date - 7, 'YYYY-MM-DD'))
  ),
  (
    'evaluation', 'update',
    jsonb_build_object('status', jsonb_build_object('from', 'draft', 'to', 'submitted'))
  )
) as t(resource, verb, changes)
where e.org_id = 'f0d3a000-0000-4000-8000-000000000001'
  and pg_temp.h(e.employee_code || t.verb || t.resource || 'keep') % 100 < 40;

-- 部署・スキル・組織設定まわりの操作もサンプルとして残す
insert into public.audit_logs (
  org_id, actor_user_id, action, resource_type, resource_id, changes, ip, created_at
)
values
  (
    'f0d3a000-0000-4000-8000-000000000001',
    '2f9a1c00-0000-4000-8000-000000000001',
    'organization.update', 'organization', 'f0d3a000-0000-4000-8000-000000000001',
    jsonb_build_object('plan', jsonb_build_object('from', 'free', 'to', 'pro')),
    '203.0.113.10', now() - interval '21 days'
  ),
  (
    'f0d3a000-0000-4000-8000-000000000001',
    '2f9a1c00-0000-4000-8000-000000000002',
    'invitation.create', 'invitation', null,
    jsonb_build_object('email', 'newcomer@fondra.example.com', 'role', 'member'),
    '203.0.113.24', now() - interval '2 days'
  ),
  (
    'f0d3a000-0000-4000-8000-000000000001',
    '2f9a1c00-0000-4000-8000-000000000001',
    'membership.update', 'membership', null,
    jsonb_build_object('role', jsonb_build_object('from', 'member', 'to', 'admin')),
    '203.0.113.10', now() - interval '14 days'
  ),
  (
    'f0d3a000-0000-4000-8000-000000000001',
    '2f9a1c00-0000-4000-8000-000000000003',
    'department.create', 'department', null,
    jsonb_build_object('name', 'QA部'),
    '203.0.113.77', now() - interval '9 days'
  ),
  (
    'f0d3a000-0000-4000-8000-000000000001',
    '2f9a1c00-0000-4000-8000-000000000002',
    'skill.delete', 'skill', null,
    jsonb_build_object('name', 'jQuery'),
    '203.0.113.24', now() - interval '5 days'
  );

commit;
