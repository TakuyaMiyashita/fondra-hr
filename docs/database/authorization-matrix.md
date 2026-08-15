# 認可マトリクス

> Phase 1B で実装時に完成させる。

## ロール × リソース × CRUD

| リソース | owner | admin | member | viewer |
|----------|-------|-------|--------|--------|
| organizations | CRUD | RU | R | R |
| memberships | CRUD | CRUD | R | R |
| invitations | CRUD | CRUD | - | - |
| departments | CRUD | CRUD | R | R |
| employees | CRUD | CRUD | R | R |
| skills | CRUD | CRUD | R | R |
| employee_skills | CRUD | CRUD | R* | R |
| one_on_ones | CRUD | CRUD | CR** | R |
| evaluation_cycles | CRUD | CRUD | R | R |
| evaluations | CRUD | CRUD | CR*** | R |
| audit_logs | R (INSERT auto) | R (INSERT auto) | R (INSERT auto) | R |

### 注記

- `R*`: member は自分のスキルのみ参照可（個人情報保護の観点は Service Layer で制御）
- `CR**`: member は `employee_id` が自分 OR `interviewer_id` が自分の 1on1 のみ作成・編集可
- `CR***`: member は `evaluator_id` が自分の評価のみ作成・編集可
- `audit_logs` は全ロールで INSERT のみ（自動記録）。UPDATE / DELETE は DB レベルで禁止
- 個人情報（birth_date, 評価コメント等）は member / viewer に非表示（Service Layer で制御）
