# 認可マトリクス

## ロール × リソース × CRUD

| リソース          | owner           | admin           | member          | viewer |
| ----------------- | --------------- | --------------- | --------------- | ------ |
| organizations     | CRUD            | RU              | R               | R      |
| memberships       | CRUD            | CRUD            | R               | R      |
| invitations       | CRUD            | CRUD            | -               | -      |
| departments       | CRUD            | CRUD            | R               | R      |
| employees         | CRUD            | CRUD            | R               | R      |
| skills            | CRUD            | CRUD            | CRU             | R      |
| employee_skills   | CRUD            | CRUD            | CRD             | R      |
| one_on_ones       | CRUD            | CRUD            | CR*U*           | R      |
| evaluation_cycles | CRUD            | CRUD            | R               | R      |
| evaluations       | CRUD            | CRUD            | CRU**           | R      |
| audit_logs        | R (INSERT auto) | R (INSERT auto) | R (INSERT auto) | R      |

## 注記

- `audit_logs` は全ロールで INSERT のみ（自動記録）。UPDATE / DELETE は DB レベルで禁止
- **削除は原則 admin 以上**。employees / skills / departments / evaluation_cycles /
  evaluations / one_on_ones のいずれも member は削除できない
  （`employee_skills` の割当解除のみ member 可）
- **`employees` の書き込みは admin 以上**。従業員レコードのメールアドレスは
  ログインユーザーとの紐付けキーであり、member が書き換えられると
  任意のレコードを「自分」に付け替えて本人限定の操作を奪えるため
  （下記「本人チェックの前提」を参照）

### `*` / `**` — 本人限定の制限

| 印   | 制限                                                                     | 状態   |
| ---- | ------------------------------------------------------------------------ | ------ |
| `*`  | member は `employee_id` か `interviewer_id` が自分の 1on1 のみ作成・編集 | 実装済 |
| `**` | member は `evaluator_id` が自分の評価のみ作成・編集                      | 実装済 |

編集時は**変更前と変更後の両方**で当事者であることを求める。変更後だけを見ると
他人同士の記録を自分の記録に見せかけて奪えるし、変更前だけを見ると
自分が入った記録を作ってから他人同士の記録に付け替えられる。

**いずれも「ログインユーザーと従業員レコードの紐付け」が前提**。
`employees.user_id` はメールアドレスで自動的に設定される（実装済み）。

- 従業員の作成・更新時 → 同一組織のメンバーからメール一致で解決
- 招待受諾時 → 同一組織の未紐付け従業員にメール一致で設定

実務では「入社手続きで従業員レコードを登録 → 後からアカウントを発行」の
順になるため、両方向で紐付けないと漏れる。

メール未登録・不一致の従業員は紐付かず、その場合「自分に紐づくデータが無い」
＝本人限定操作ができない、という安全側に倒れる。

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
