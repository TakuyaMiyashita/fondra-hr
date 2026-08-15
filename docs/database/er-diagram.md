# ER図

## 全体図（Phase 1A + 1B）

```mermaid
erDiagram
    organizations ||--o{ memberships : has
    organizations ||--o{ invitations : has
    organizations ||--o{ departments : has
    organizations ||--o{ employees : has
    organizations ||--o{ skills : has
    organizations ||--o{ one_on_ones : has
    organizations ||--o{ evaluation_cycles : has
    organizations ||--o{ audit_logs : has
    auth_users ||--o{ memberships : belongs_to

    departments ||--o{ departments : parent
    departments ||--o{ employees : belongs_to
    employees ||--o{ employee_skills : has
    skills ||--o{ employee_skills : has
    employees ||--o{ one_on_ones : as_employee
    employees ||--o{ one_on_ones : as_interviewer
    evaluation_cycles ||--o{ evaluations : contains
    employees ||--o{ evaluations : evaluated
    employees ||--o{ evaluations : evaluator

    organizations {
        uuid id PK
        text name
        text slug UK
        text plan
        timestamptz created_at
        timestamptz updated_at
    }

    memberships {
        uuid id PK
        uuid user_id FK
        uuid org_id FK
        text role
        timestamptz created_at
        timestamptz updated_at
    }

    invitations {
        uuid id PK
        uuid org_id FK
        text email
        text role
        uuid token UK
        timestamptz expires_at
        timestamptz accepted_at
        timestamptz created_at
    }

    departments {
        uuid id PK
        uuid org_id FK
        text name
        uuid parent_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    employees {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        uuid department_id FK
        text employee_code
        text full_name
        text full_name_kana
        text email
        text position
        date hired_on
        date birth_date
        text avatar_path
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    skills {
        uuid id PK
        uuid org_id FK
        text name
        text category
        timestamptz created_at
        timestamptz updated_at
    }

    employee_skills {
        uuid id PK
        uuid org_id FK
        uuid employee_id FK
        uuid skill_id FK
        int level
        date certified_at
        timestamptz created_at
        timestamptz updated_at
    }

    one_on_ones {
        uuid id PK
        uuid org_id FK
        uuid employee_id FK
        uuid interviewer_id FK
        date held_on
        text notes
        text ai_summary
        int mood_score
        timestamptz created_at
        timestamptz updated_at
    }

    evaluation_cycles {
        uuid id PK
        uuid org_id FK
        text name
        date period_start
        date period_end
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    evaluations {
        uuid id PK
        uuid org_id FK
        uuid cycle_id FK
        uuid employee_id FK
        uuid evaluator_id FK
        jsonb ratings
        text comment
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    audit_logs {
        uuid id PK
        uuid org_id FK
        uuid actor_user_id FK
        text action
        text resource_type
        uuid resource_id
        jsonb changes
        text ip
        timestamptz created_at
    }
```

## ユニーク制約

| テーブル | カラム | 用途 |
|----------|--------|------|
| `memberships` | `(user_id, org_id)` | ユーザーは1組織に1メンバーシップ |
| `employees` | `(org_id, employee_code)` | 組織内で社員番号は一意 |
| `skills` | `(org_id, name)` | 組織内でスキル名は一意 |
| `employee_skills` | `(employee_id, skill_id)` | 1人1スキルにつき1レコード |

## ビュー

### employee_risk_scores

`security_invoker = true` で RLS がビュー経由でも適用される。

4軸スコア（各0-25点、合計0-100点）:
- **在籍期間**: 短いほど高リスク
- **1on1頻度**: 直近3ヶ月の回数が少ないほど高リスク
- **mood推移**: 直近3回の平均が低いほど高リスク
- **スキル変化**: 直近の更新が古いほど高リスク

リスクレベル: 0-33 = low, 34-66 = medium, 67-100 = high
