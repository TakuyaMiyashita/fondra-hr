# 認証・認可モデルの設計

## 認証（Authentication）

Supabase Auth を使用。メール + パスワードによる認証を基本とする。

### Custom Access Token Hook

JWT 発行時に PL/pgSQL 関数 `auth.custom_access_token_hook` が呼ばれ、`app_metadata` にテナント情報を埋め込む。

```mermaid
sequenceDiagram
    participant User
    participant Auth as Supabase Auth
    participant Hook as custom_access_token_hook
    participant DB as memberships table

    User->>Auth: signInWithPassword()
    Auth->>Hook: event (user_id, claims)
    Hook->>DB: SELECT org_id, role WHERE user_id = ?
    DB-->>Hook: membership record
    Hook-->>Auth: claims + { app_metadata: { org_id, role } }
    Auth-->>User: JWT (org_id, role embedded)
```

### Hook のロジック

1. JWT の `app_metadata.org_id` を確認
2. 値がある場合 → `memberships` でその組織のメンバーシップが存在するか検証
3. メンバーシップが無効（削除済み等）なら → 最初のメンバーシップにフォールバック
4. メンバーシップが一切ない → `org_id` と `role` を null に設定

### 組織切替フロー

```mermaid
sequenceDiagram
    participant User
    participant App as Next.js App
    participant Service as Service Layer
    participant Auth as Supabase Auth

    User->>App: 組織スイッチャーで組織Bを選択
    App->>Service: switchOrganization(userId, orgBId)
    Note over Service: memberships を引いて所属を検証。<br/>無ければここで打ち切り（app_metadata は書かない）
    Service-->>App: ok({ orgId, role })
    App->>Auth: admin.updateUserById(userId, { app_metadata: { org_id: orgBId } })
    Auth-->>App: OK
    App->>Auth: refreshSession()
    Note over Auth: Hook が再実行され JWT に org B の情報が入る
    Auth-->>App: 新しい JWT (org_id = orgB)
    App-->>User: 画面が組織Bのデータに切り替わる
```

#### app_metadata の書き込みに service_role が要る理由

Hook が読むのは `app_metadata` だが、この領域はクライアント（anon キー）からは
書き換えられない。ユーザーが自分で `org_id` を書けたら、所属していない組織の
JWT を自分で発行できてしまうためで、これは意図的な設計。したがって組織切替は
service_role の Auth Admin API（`auth.admin.updateUserById`）を通す。

`supabase.auth.updateUser({ data })` が書くのは `user_metadata` であり、
Hook はこれを読まない。ここに `org_id` を書いても組織は切り替わらない。

service_role は RLS を丸ごとバイパスするため、**Server Action 側で
`switchOrganization()` によるメンバーシップ検証を通してから**呼ぶ。
検証を挟まないとクライアント指定の `orgId` がそのままクレームになり、
権限昇格になる。JWT Hook 側の再検証（上記ロジックの 2〜3）は最後の安全網であって、
アプリ側の検証を省略してよい理由にはならない。

## 認可（Authorization）

### ロール定義

| ロール   | 説明                                          |
| -------- | --------------------------------------------- |
| `owner`  | 組織の作成者。全権限                          |
| `admin`  | 管理者。owner と同等の権限（組織削除を除く）  |
| `member` | 一般メンバー。参照 + 自分に紐づくデータの編集 |
| `viewer` | 閲覧のみ。デモログイン用途                    |

### 認可の二層構造

```
リクエスト
  ↓
[RLS] org_id チェック → テナント外のデータを完全遮断
  ↓
[Service Layer] authorize(ctx, action, resource) → ロール別の細かな権限チェック
  ↓
データアクセス
```

- **RLS（安全網）**: `org_id = current_org_id()` のみ。シンプルで壊れにくい
- **Service Layer（主）**: ロール × リソース × 操作の認可マトリクスを TypeScript で実装

どちらか一方が漏れてもデータは守られる。

### 認可マトリクス

詳細は [`docs/database/authorization-matrix.md`](../database/authorization-matrix.md) を参照。

## セッション管理

- JWT 有効期限: 1時間（`config.toml` の `jwt_expiry = 3600`）
- リフレッシュトークンローテーション有効
- `middleware.ts` で全リクエスト時にセッション更新
- 未認証ユーザーは `/login` にリダイレクト
