# テナント分離設計

## 設計方針

**DB に到達する経路をひとつに絞り、そこで分離を保証する。**

```mermaid
graph LR
    REQ[Request] --> SVC[Service Layer]
    SVC -->|"WHERE org_id = ctx.orgId"| DRIZZLE[Drizzle ORM]
    DRIZZLE --> PG[(PostgreSQL)]
    PG --> DATA[Data]

    API["Data API<br/>(PostgREST / GraphQL)"] -.->|GRANT 剥奪済み| PG

    style SVC fill:#bbf,stroke:#333
    style API stroke-dasharray: 5 5
```

### Layer 1: Service Layer（唯一の経路 / 主防御）

- 全クエリに `WHERE org_id = ctx.orgId` を自動付与
- `ctx.orgId` は JWT Custom Claims から取得した値のみ使用
- Service Layer を経由しない DB アクセスは禁止

### Layer 2: Data API を閉じる

Supabase は Data API を既定で公開する。ここが開いていると、ログイン中の
ユーザーが Service Layer を通さずにテーブルを直接叩けてしまい、
**Service Layer にしか無い認可が丸ごと迂回される**。

`public` の全テーブル・ビューについて `anon` / `authenticated` の GRANT を
剥がしてある（`supabase/migrations/20260822000001_revoke_data_api_grants.sql`）。
詳しい経緯は [ADR 0011](../adr/0011-data-api-is-closed.md)。

### RLS の位置づけ

全テーブルで RLS を有効化し、`org_id = current_org_id()` のポリシーを定義して
いるが、**アプリの経路では RLS は評価されない**。Drizzle は `DATABASE_URL` で
`postgres`（テーブル所有者）として接続しており、所有者に RLS は適用されないため。

| 経路                            | RLS が効くか | 認可を担うもの |
| ------------------------------- | ------------ | -------------- |
| アプリ（RSC / Server Action）   | **効かない** | Service Layer  |
| Data API（PostgREST / GraphQL） | 効く         | —（閉鎖済み）  |

つまり現状の RLS は「GRANT を戻したときのための保険」であって、
稼働中の防御層ではない。ポリシーを残しているのは、将来 Data API を開ける
判断をしたときに無防備にならないようにするため。

**「二重防御があるから Service Layer は多少雑でもよい」とは考えないこと。**
テナント分離は実質 Service Layer の単独責任である。

## org_id の強制

全テーブルに `org_id uuid not null` を持たせる。`evaluations` のように親テーブル（`evaluation_cycles`）経由で `org_id` を辿れるテーブルでも、直接 `org_id` を持つ。理由:

1. RLS ポリシーが全テーブルで同一パターン（`org_id = current_org_id()`）になり、設定漏れを防げる
2. JOIN なしでテナント判定できるため、パフォーマンスが予測しやすい

## 対象テーブル一覧

| テーブル          | org_id         | RLS | 備考                    |
| ----------------- | -------------- | --- | ----------------------- |
| organizations     | `id` が org_id | Yes | `id = current_org_id()` |
| memberships       | Yes            | Yes |                         |
| invitations       | Yes            | Yes |                         |
| departments       | Yes            | Yes |                         |
| employees         | Yes            | Yes |                         |
| skills            | Yes            | Yes |                         |
| employee_skills   | Yes            | Yes |                         |
| one_on_ones       | Yes            | Yes |                         |
| evaluation_cycles | Yes            | Yes |                         |
| evaluations       | Yes            | Yes |                         |
| audit_logs        | Yes            | Yes | SELECT + INSERT のみ    |

## 監査ログの不変性

`audit_logs` は DB レベルで UPDATE/DELETE を禁止する:

- BEFORE UPDATE / BEFORE DELETE トリガーで例外を発生
- `authenticated` ロールには SELECT + INSERT のみ GRANT
- service_role でも UPDATE/DELETE はトリガーでブロックされる

### 例外: 組織のパージ

`audit_logs.org_id` は `organizations` を `ON DELETE CASCADE` で参照している。
不変性を無条件に適用すると、監査ログを1件でも持つ組織はカスケード削除が
トリガーに拒否され、**永久に削除できなくなる**（解約顧客のデータ削除が不可能になる）。

そのため、明示的なパージ操作のときだけ削除を通す経路を用意している。

| 操作                             | 通常時   | パージ中                                 |
| -------------------------------- | -------- | ---------------------------------------- |
| `audit_logs` の UPDATE           | 拒否     | **拒否**（書き換えは常に認めない）       |
| `audit_logs` の DELETE           | 拒否     | 許可                                     |
| ドメインテーブル変更時の監査記録 | 記録する | 記録しない（記録先の組織ごと消えるため） |

```sql
-- 組織とその全関連データ（監査ログ含む）を削除する唯一の経路
select public.purge_organization('<org_id>');
```

- パージ中かどうかは `app.audit_log_purge` というトランザクションローカルな設定で判定する。
  `purge_organization()` の実行トランザクションを抜けた時点で自動的に元へ戻るため、
  フラグが立ちっぱなしになることはない
- `purge_organization()` は `service_role` にのみ EXECUTE を GRANT している。
  そもそも `authenticated` には `organizations` / `audit_logs` の DELETE 権限も
  削除を許す RLS ポリシーも無いため、アプリのエンドユーザーからは到達できない
