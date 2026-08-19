# 認可マトリクス

## ロール × リソース × CRUD

| リソース          | owner           | admin           | member          | viewer |
| ----------------- | --------------- | --------------- | --------------- | ------ |
| organizations     | CRUD            | RU              | R               | R      |
| memberships       | CRUD            | CRUD            | R               | R      |
| invitations       | CRUD            | CRUD            | -               | -      |
| departments       | CRUD            | CRUD            | R               | R      |
| employees         | CRUD            | CRUD            | CRU             | R      |
| skills            | CRUD            | CRUD            | CRU             | R      |
| employee_skills   | CRUD            | CRUD            | CRD             | R      |
| one_on_ones       | CRUD            | CRUD            | CRU*            | R      |
| evaluation_cycles | CRUD            | CRUD            | R               | R      |
| evaluations       | CRUD            | CRUD            | CRU**           | R      |
| audit_logs        | R (INSERT auto) | R (INSERT auto) | R (INSERT auto) | R      |

## 注記

- `audit_logs` は全ロールで INSERT のみ（自動記録）。UPDATE / DELETE は DB レベルで禁止
- **削除は原則 admin 以上**。employees / skills / departments / evaluation_cycles /
  evaluations / one_on_ones のいずれも member は削除できない
  （`employee_skills` の割当解除のみ member 可）

### `*` / `**` — 未実装の制限

| 印   | 想定していた制限                                                         | 現状   |
| ---- | ------------------------------------------------------------------------ | ------ |
| `*`  | member は `employee_id` か `interviewer_id` が自分の 1on1 のみ作成・編集 | 未実装 |
| `**` | member は `evaluator_id` が自分の評価のみ作成・編集                      | 未実装 |

**いずれも「ログインユーザーと従業員レコードの紐付け」が前提**だが、
`employees.user_id` はカラムこそ存在するもののアプリからは書き込んでおらず、
`supabase/seed.sql` がメールアドレスで紐付けているだけである
（本番相当の環境では常に null）。

この状態で本人チェックを入れると、member は 1on1 も評価も一切作成できなくなる。
先に `employees.user_id` を設定する経路（従業員登録時のユーザー選択、
またはメールアドレスによる自動紐付け）を用意する必要がある。

現状のリスク:

- member が自分の評価を自分で編集できる（評価者チェックが無いため）
- member が他人同士の 1on1 記録を作成・編集できる（閲覧は仕様どおり可）

### 個人情報のフィールド制御 — 未実装

`birth_date` や評価の `comment` を member / viewer に返さない制御は
**実装されていない**。`getEmployee` / `listEmployees` はロールに関わらず
全フィールドを返す。

## 認可の実装場所

| レイヤー          | 責務                                               |
| ----------------- | -------------------------------------------------- |
| **RLS**           | テナント分離のみ（`org_id = current_org_id()`）    |
| **Service Layer** | ロール別 CRUD 制御（フィールド単位の制御は未実装） |
| **UI**            | ロールに応じたナビ項目・ボタンの表示/非表示        |

認可チェックは Service Layer と UI の二重で行う。Service Layer が主、UI は UX 目的。
