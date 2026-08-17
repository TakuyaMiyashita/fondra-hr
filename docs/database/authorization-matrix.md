# 認可マトリクス

## ロール × リソース × CRUD

| リソース          | owner           | admin           | member          | viewer |
| ----------------- | --------------- | --------------- | --------------- | ------ |
| organizations     | CRUD            | RU              | R               | R      |
| memberships       | CRUD            | CRUD            | R               | R      |
| invitations       | CRUD            | CRUD            | -               | -      |
| departments       | CRUD            | CRUD            | R               | R      |
| employees         | CRUD            | CRUD            | R               | R      |
| skills            | CRUD            | CRUD            | R               | R      |
| employee_skills   | CRUD            | CRUD            | R               | R      |
| one_on_ones       | CRUD            | CRUD            | CR*             | R      |
| evaluation_cycles | CRUD            | CRUD            | R               | R      |
| evaluations       | CRUD            | CRUD            | CR**            | R      |
| audit_logs        | R (INSERT auto) | R (INSERT auto) | R (INSERT auto) | R      |

## 注記

- `CR*`: member は `employee_id` が自分 OR `interviewer_id` が自分の 1on1 のみ作成・編集可
- `CR**`: member は `evaluator_id` が自分の評価のみ作成・編集可
- `audit_logs` は全ロールで INSERT のみ（自動記録）。UPDATE / DELETE は DB レベルで禁止
- 個人情報（`birth_date`, 評価 `comment` 等）は member / viewer に非表示（Service Layer で制御）

## 認可の実装場所

| レイヤー          | 責務                                             |
| ----------------- | ------------------------------------------------ |
| **RLS**           | テナント分離のみ（`org_id = current_org_id()`）  |
| **Service Layer** | ロール別 CRUD 制御、フィールド単位のアクセス制御 |
| **UI**            | ロールに応じたナビ項目・ボタンの表示/非表示      |

認可チェックは Service Layer と UI の二重で行う。Service Layer が主、UI は UX 目的。
