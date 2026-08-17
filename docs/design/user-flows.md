# ユーザーフロー図

## 主要フロー一覧

1. サインアップ → 組織作成
2. ログイン → ダッシュボード
3. 招待承認 → 組織参加
4. 組織切替
5. 従業員管理（CRUD）
6. 1on1 記録
7. 評価ワークフロー
8. AI機能（要約・分析・検索）

---

## 1. サインアップ → 組織作成

```mermaid
sequenceDiagram
    actor User
    participant UI as サインアップ画面
    participant SA as Server Action
    participant Auth as Supabase Auth
    participant SVC as Service Layer
    participant DB as PostgreSQL

    User->>UI: 組織名 + メール + パスワード入力
    UI->>SA: signUp()
    SA->>Auth: auth.signUp()
    Auth-->>SA: user
    SA->>SVC: createOrganizationWithOwner()
    SVC->>DB: INSERT organizations
    SVC->>DB: INSERT memberships (role=owner)
    SVC-->>SA: ok
    SA-->>UI: redirect /login?registered=true
```

## 2. ログイン → ダッシュボード

```mermaid
sequenceDiagram
    actor User
    participant UI as ログイン画面
    participant SA as Server Action
    participant Auth as Supabase Auth
    participant Hook as Custom Access Token Hook
    participant MW as Middleware

    User->>UI: メール + パスワード入力
    UI->>SA: signIn()
    SA->>Auth: auth.signInWithPassword()
    Auth->>Hook: JWT発行時にフック実行
    Hook->>Hook: memberships から org_id, role 取得
    Hook-->>Auth: app_metadata に org_id, role 埋込
    Auth-->>SA: session (JWT with org_id, role)
    SA-->>UI: redirect /employees
    UI->>MW: /employees へリクエスト
    MW->>Auth: getUser() でセッション検証
    MW-->>UI: 200 OK
```

## 3. 招待承認 → 組織参加

```mermaid
sequenceDiagram
    actor Admin
    actor Invitee
    participant UI as 招待承認画面
    participant SA as Server Action
    participant Auth as Supabase Auth
    participant SVC as Service Layer
    participant DB as PostgreSQL

    Admin->>DB: INSERT invitations (email, role, token, expires_at)
    Admin-->>Invitee: 招待メール (リンク含む)
    Invitee->>UI: /invite/[token] にアクセス
    UI->>SVC: getInvitationByToken()
    SVC->>DB: SELECT invitations WHERE token = ?
    SVC-->>UI: 招待情報 (org_name, role, email)
    Invitee->>UI: パスワード入力
    UI->>SA: acceptInviteAndSignUp()
    SA->>Auth: auth.signUp()
    Auth-->>SA: user
    SA->>SVC: acceptInvitation()
    SVC->>DB: INSERT memberships
    SVC->>DB: UPDATE invitations SET accepted_at
    SA-->>UI: redirect /login?registered=true
```

## 4. 組織切替

```mermaid
sequenceDiagram
    actor User
    participant UI as 組織スイッチャー
    participant SA as Server Action
    participant Auth as Supabase Auth
    participant Hook as Custom Access Token Hook

    User->>UI: ドロップダウンから別組織を選択
    UI->>SA: switchOrg(orgId)
    SA->>Auth: updateUser({ data: { org_id } })
    SA->>Auth: refreshSession()
    Auth->>Hook: JWT再発行時にフック実行
    Hook->>Hook: 新しい org_id で role 取得
    Hook-->>Auth: 新しい app_metadata
    Auth-->>SA: 新しいセッション
    SA-->>UI: redirect /employees
```

## 5. 未認証リダイレクト

```mermaid
sequenceDiagram
    actor User
    participant MW as Middleware
    participant Auth as Supabase Auth

    User->>MW: 認証が必要なパスにアクセス
    MW->>Auth: getUser()
    Auth-->>MW: null (未認証)
    MW-->>User: redirect /login
```
