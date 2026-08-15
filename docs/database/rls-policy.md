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

## API アクセス権限

`auto_expose_new_tables` が無効のため、`authenticated` ロールに明示的な GRANT が必要：

| テーブル | GRANT |
|----------|-------|
| `organizations` | SELECT, UPDATE |
| `memberships` | SELECT, INSERT, UPDATE, DELETE |
| `invitations` | SELECT, INSERT, UPDATE, DELETE |

`anon` ロールにはいずれのテーブルへのアクセスも付与しない。

## テスト

`tests/rls/tenant-isolation.test.ts` で以下を検証：

- 2つの異なるテナントのユーザーが、相互のデータにアクセスできないこと
- SELECT / INSERT / UPDATE / DELETE の全操作でテナント分離が機能すること
- Custom Access Token Hook が JWT に正しく `org_id` / `role` を埋め込むこと
