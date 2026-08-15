# RLSポリシー設計

## 設計方針

- 全テーブルで RLS を有効化
- ポリシーは **テナント分離（org_id チェック）のみ**
- ロール別の細かな制御は Service Layer で実装
- RLS はあくまで安全網（defense-in-depth の第2レイヤー）

## テナント判定方式

JWT のカスタムクレーム `app_metadata.org_id` から現在のテナントを判定する。ヘルパー関数でラップ：

```sql
create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid;
$$;
```

Custom Access Token Hook が `memberships` テーブルを参照し、ユーザーの現在の `org_id` と `role` を JWT に埋め込む。

## ポリシー一覧

### organizations

| 操作 | ポリシー | 条件 |
|------|----------|------|
| SELECT | `organizations_select` | `id = current_org_id()` |
| UPDATE | `organizations_update` | `id = current_org_id()` |
| INSERT | なし（service_role のみ） | — |
| DELETE | なし（service_role のみ） | — |

組織の作成・削除は Service Layer が `service_role` クライアント経由で行う。サインアップ時の組織作成は認証済みユーザーの JWT にまだ `org_id` がないため、`authenticated` による INSERT は不可。

### memberships

| 操作 | ポリシー | 条件 |
|------|----------|------|
| SELECT | `memberships_select` | `org_id = current_org_id()` |
| INSERT | `memberships_insert` | `org_id = current_org_id()` |
| UPDATE | `memberships_update` | `org_id = current_org_id()` |
| DELETE | `memberships_delete` | `org_id = current_org_id()` |

### invitations

| 操作 | ポリシー | 条件 |
|------|----------|------|
| SELECT | `invitations_select` | `org_id = current_org_id()` |
| INSERT | `invitations_insert` | `org_id = current_org_id()` |
| UPDATE | `invitations_update` | `org_id = current_org_id()` |
| DELETE | `invitations_delete` | `org_id = current_org_id()` |

### departments / employees / skills / employee_skills / one_on_ones / evaluation_cycles / evaluations

全テーブル共通パターン:

| 操作 | 条件 |
|------|------|
| SELECT | `org_id = current_org_id()` |
| INSERT | `org_id = current_org_id()` |
| UPDATE | `org_id = current_org_id()` |
| DELETE | `org_id = current_org_id()` |

### audit_logs

| 操作 | ポリシー | 条件 |
|------|----------|------|
| SELECT | `audit_logs_select` | `org_id = current_org_id()` |
| INSERT | `audit_logs_insert` | `org_id = current_org_id()` |
| UPDATE | なし + BEFORE トリガーで例外 | — |
| DELETE | なし + BEFORE トリガーで例外 | — |

## API アクセス権限

`auto_expose_new_tables` が無効のため、`authenticated` ロールに明示的な GRANT が必要：

| テーブル | GRANT |
|----------|-------|
| `organizations` | SELECT, UPDATE |
| `memberships` | SELECT, INSERT, UPDATE, DELETE |
| `invitations` | SELECT, INSERT, UPDATE, DELETE |
| `departments` | SELECT, INSERT, UPDATE, DELETE |
| `employees` | SELECT, INSERT, UPDATE, DELETE |
| `skills` | SELECT, INSERT, UPDATE, DELETE |
| `employee_skills` | SELECT, INSERT, UPDATE, DELETE |
| `one_on_ones` | SELECT, INSERT, UPDATE, DELETE |
| `evaluation_cycles` | SELECT, INSERT, UPDATE, DELETE |
| `evaluations` | SELECT, INSERT, UPDATE, DELETE |
| `audit_logs` | SELECT, INSERT |
| `employee_risk_scores` | SELECT |

`anon` ロールにはいずれのテーブルへのアクセスも付与しない。

## テスト

- `tests/rls/tenant-isolation.test.ts` — テナント基盤テーブル（Phase 1A）
- `tests/rls/domain-tables.test.ts` — 業務ドメインテーブル（Phase 1B）

検証内容:
- 2つの異なるテナントのユーザーが、相互のデータにアクセスできないこと
- SELECT / INSERT / UPDATE / DELETE の全操作でテナント分離が機能すること
- Custom Access Token Hook が JWT に正しく `org_id` / `role` を埋め込むこと
- `audit_logs` の UPDATE / DELETE が DB レベルで拒否されること
- 監査ログの自動記録が動作すること
- `employee_risk_scores` ビューのテナント分離とスコア計算
