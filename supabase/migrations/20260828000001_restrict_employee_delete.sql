-- 従業員の削除で他人の記録が消えるのを止める
--
-- 背景:
--   employees を参照する外部キーが4本とも on delete cascade だった。
--   Service Layer の deleteEmployee にも関連チェックが無く、1行消すだけで
--   その従業員が「評価者として書いた他人の評価」と「面談者として実施した
--   部下の1on1」まで黙って消えていた。
--
--   ローカルのデモデータで実測（評価者として最多の従業員を1人削除）:
--
--     評価者として書いた評価      20件 → 0件
--     面談者として実施した 1on1   38件 → 0件
--     本人が受けた評価 / 1on1      2件 / 5件 → 0件
--
--   DELETE 1 の裏で65件が消える。退職した上長を消すと、その人が書いた
--   部下全員の評価が、部下側の履歴から欠落する。監査ログには氏名しか
--   残らないため内容は復元できない。
--
--   departments は子部署・所属従業員があれば削除を拒否し、skills は
--   割当済みなら拒否する。employees だけが素通しだった。
--
-- 方針:
--   評価と 1on1 は**他人が書いた記録**でもあるため restrict にする。
--   参照が残っている従業員は削除させず、status = 'retired' に倒す運用にする。
--   個人情報の削除請求には別途「匿名化」で応える（Service Layer の
--   anonymizeEmployee）。
--
--   employee_skills は cascade のまま残す。スキル割当はその従業員自身の
--   属性でしかなく、消えても他人の記録は損なわれない。

alter table public.evaluations
  drop constraint evaluations_employee_id_fkey,
  add constraint evaluations_employee_id_fkey
    foreign key (employee_id) references public.employees(id) on delete restrict;

alter table public.evaluations
  drop constraint evaluations_evaluator_id_fkey,
  add constraint evaluations_evaluator_id_fkey
    foreign key (evaluator_id) references public.employees(id) on delete restrict;

alter table public.one_on_ones
  drop constraint one_on_ones_employee_id_fkey,
  add constraint one_on_ones_employee_id_fkey
    foreign key (employee_id) references public.employees(id) on delete restrict;

alter table public.one_on_ones
  drop constraint one_on_ones_interviewer_id_fkey,
  add constraint one_on_ones_interviewer_id_fkey
    foreign key (interviewer_id) references public.employees(id) on delete restrict;
