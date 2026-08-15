# ER図

## テナント基盤（Phase 1A）

```mermaid
erDiagram
    organizations ||--o{ memberships : has
    organizations ||--o{ invitations : has
    auth_users ||--o{ memberships : belongs_to

    organizations {
        uuid id PK "gen_random_uuid()"
        text name "NOT NULL"
        text slug "UNIQUE NOT NULL"
        text plan "NOT NULL DEFAULT 'free'"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    memberships {
        uuid id PK "gen_random_uuid()"
        uuid user_id FK "auth.users(id) ON DELETE CASCADE"
        uuid org_id FK "organizations(id) ON DELETE CASCADE"
        text role "NOT NULL CHECK (owner|admin|member|viewer)"
        timestamptz created_at "NOT NULL DEFAULT now()"
        timestamptz updated_at "NOT NULL DEFAULT now()"
    }

    invitations {
        uuid id PK "gen_random_uuid()"
        uuid org_id FK "organizations(id) ON DELETE CASCADE"
        text email "NOT NULL"
        text role "NOT NULL CHECK (owner|admin|member|viewer)"
        uuid token "UNIQUE NOT NULL DEFAULT gen_random_uuid()"
        timestamptz expires_at "NOT NULL"
        timestamptz accepted_at "nullable"
        timestamptz created_at "NOT NULL DEFAULT now()"
    }
```

### インデックス

| テーブル | カラム | 種別 | 用途 |
|----------|--------|------|------|
| `memberships` | `(user_id, org_id)` | UNIQUE | ユーザーは1組織に1メンバーシップ |
| `memberships` | `(org_id)` | INDEX | テナント内メンバー一覧 |
| `memberships` | `(user_id)` | INDEX | ユーザーの所属組織一覧 |
| `invitations` | `(org_id, email)` | INDEX | 重複招待チェック |
| `invitations` | `(token)` | UNIQUE | トークン検索（UNIQUE制約で自動） |

## 業務ドメイン（Phase 1B）

> Phase 1B 開始時に追記する。
