# ユーザーフロー図

## 主要フロー一覧

1. サインアップ → 組織作成
2. ログイン → ダッシュボード
3. 招待承認 → 組織参加
4. 組織切替
5. 未認証リダイレクト
6. 従業員管理（CRUD）
7. 1on1 記録
8. 評価ワークフロー
9. AI チャット

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
    SA->>Auth: auth.signUp(options.data = { pending_org_name })
    alt メール確認が有効
        Auth-->>SA: user のみ（session なし）
        Note over SA: 組織は作らない。確認されない登録のぶんだけ<br/>誰も入れない組織が残るのを防ぐ
        SA-->>UI: redirect /login?registered=true
        User->>Auth: 確認メールのリンクを開く
        Auth-->>SA: /auth/callback?code=...
        SA->>Auth: exchangeCodeForSession()
        SA->>SVC: completePendingSignUp()
        SVC->>DB: INSERT organizations / memberships
        SA->>Auth: refreshSession()
        SA-->>UI: redirect /employees
    else メール確認が無効
        Auth-->>SA: user + session
        SA->>SVC: createOrganizationWithOwner()
        SVC->>DB: INSERT organizations
        SVC->>DB: INSERT memberships (role=owner)
        SA->>Auth: refreshSession()
        SA-->>UI: redirect /dashboard
    end
```

`refreshSession()` を省くとメンバーシップ作成前の JWT のまま画面に入り、
リダイレクトループになる。詳細は
[認証・認可モデル](../architecture/auth-and-authorization.md)。

## 2. ログイン → ダッシュボード

```mermaid
sequenceDiagram
    actor User
    participant UI as ログイン画面
    participant SA as Server Action
    participant Auth as Supabase Auth
    participant Hook as Custom Access Token Hook
    participant MW as proxy.ts

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
    SA->>Auth: auth.signUp(options.data = { pending_invitation_token })
    alt メール確認が有効
        Auth-->>SA: user のみ（session なし）
        Note over SA: 受諾しない。ここで accepted_at を立てると<br/>確認しないまま招待だけが消費される
        SA-->>UI: redirect /login?registered=true
        Note over Invitee,DB: 確認後、/auth/callback で completePendingSignUp() が<br/>トークンを引き直し、確認済みメールとの一致を検証して受諾
    else メール確認が無効
        Auth-->>SA: user + session
        SA->>SVC: acceptInvitation()
        SVC->>DB: INSERT memberships
        SVC->>DB: UPDATE invitations SET accepted_at
        SA-->>UI: redirect /dashboard
    end
```

## 4. 組織切替

```mermaid
sequenceDiagram
    actor User
    participant UI as 組織スイッチャー
    participant SA as Server Action
    participant SVC as Service Layer
    participant Admin as Supabase Auth Admin API
    participant Auth as Supabase Auth
    participant Hook as Custom Access Token Hook

    User->>UI: ドロップダウンから別組織を選択
    UI->>SA: switchOrg(orgId)
    SA->>SVC: switchOrganization(userId, orgId)
    alt メンバーシップ無し
        SVC-->>SA: err(この組織へのアクセス権がありません)
        SA-->>UI: Result（toast 表示・遷移しない）
    else メンバーシップ有り
        SVC-->>SA: ok({ orgId, role })
        SA->>Admin: updateUserById(userId, { app_metadata: { org_id } })
        SA->>Auth: refreshSession()
        Auth->>Hook: JWT再発行時にフック実行
        Hook->>Hook: 新しい org_id で role 取得
        Hook-->>Auth: 新しい app_metadata
        Auth-->>SA: 新しいセッション
        SA-->>UI: redirect /employees
        UI->>UI: TanStack Query のキャッシュを破棄
    end
```

`app_metadata` はクライアントから書き換えられない領域であり、更新には
service_role の Auth Admin API が要る。`updateUser({ data })` が書くのは
`user_metadata` で、Hook が読むのは `app_metadata` なので組織は切り替わらない。
service_role は RLS をバイパスするため、**書き込みの手前で必ず
`switchOrganization()` によるメンバーシップ検証を通す**。

`redirect()` は**クライアントサイドのナビゲーション**なので、React のツリー＝
`QueryClient` は生き残る。一覧系のクエリキーには組織を表す値が入っていないため、
何もしないと**切替後も前の組織のデータが描画される**（`staleTime` の間は再取得も
走らない）。`TenantQueryBoundary`（`src/components/layout/tenant-query-boundary.tsx`）が
テナントの変化を検知してキャッシュを捨てる。

## 5. 未認証リダイレクト

```mermaid
sequenceDiagram
    actor User
    participant MW as proxy.ts
    participant Auth as Supabase Auth

    User->>MW: 認証が必要なパスにアクセス
    MW->>Auth: getUser()
    Auth-->>MW: null (未認証)
    MW-->>User: redirect /login
```

## 6. 従業員管理（CRUD）

```mermaid
sequenceDiagram
    actor User
    participant UI as 従業員一覧画面
    participant SA as Server Action
    participant SVC as Service Layer
    participant DB as PostgreSQL

    Note over User,DB: 一覧表示
    User->>UI: /employees にアクセス
    UI->>SVC: listEmployees(ctx, params)
    SVC->>SVC: authorize(ctx, 'read', 'employee')
    SVC->>DB: SELECT employees WHERE org_id = ctx.orgId
    DB-->>UI: 従業員リスト

    Note over User,DB: 新規作成
    User->>UI: Sheet でフォーム入力
    UI->>SA: createEmployeeAction(data)
    SA->>SA: Zod バリデーション
    SA->>SVC: createEmployee(ctx, input)
    SVC->>SVC: authorize(ctx, 'create', 'employee')
    SVC->>DB: INSERT employees
    SVC->>DB: INSERT audit_logs
    SVC-->>SA: ok
    SA-->>UI: toast.success + revalidatePath
```

## 7. 1on1 記録

```mermaid
sequenceDiagram
    actor User
    participant UI as 1on1一覧画面
    participant SA as Server Action
    participant SVC as Service Layer
    participant DB as PostgreSQL

    Note over User,DB: 一覧表示
    User->>UI: /one-on-ones にアクセス
    UI->>SVC: listOneOnOnes(ctx, params)
    SVC->>SVC: authorize(ctx, 'read', 'one_on_one')
    SVC->>SVC: getOneOnOneScope(ctx)
    Note over SVC: admin 以上は全件。member / viewer は<br/>自分が当事者の記録のみ。未紐付けは0件
    SVC->>DB: SELECT WHERE org_id = ctx.orgId<br/>AND (employee_id = 自分 OR interviewer_id = 自分)
    DB-->>UI: 1on1リスト

    Note over User,DB: 記録作成（member の場合）
    User->>UI: Dialog でフォーム入力
    UI->>SA: createOneOnOneAction(data)
    SA->>SVC: createOneOnOne(ctx, input)
    SVC->>SVC: authorize(ctx, 'create', 'one_on_one', memberCheck)
    Note over SVC: member は自分が employee_id または interviewer_id の場合のみ
    SVC->>DB: INSERT one_on_ones
    SVC->>DB: INSERT audit_logs
    SVC-->>SA: ok
    SA-->>UI: toast.success + revalidatePath
```

## 8. 評価ワークフロー

```mermaid
sequenceDiagram
    actor Admin
    actor Evaluator
    participant UI as 評価画面
    participant SA as Server Action
    participant SVC as Service Layer
    participant DB as PostgreSQL

    Note over Admin,DB: サイクル作成（admin）
    Admin->>UI: 評価サイクル作成 Dialog
    UI->>SA: createCycleAction(data)
    SA->>SVC: createCycle(ctx, input)
    SVC->>DB: INSERT evaluation_cycles (status=draft)
    SVC-->>UI: ok

    Note over Admin,DB: 評価者アサイン
    Admin->>UI: 評価追加 Dialog（従業員 + 評価者選択）
    UI->>SA: createEvaluationAction(data)
    SA->>SVC: createEvaluation(ctx, input)
    SVC->>DB: INSERT evaluations (status=draft)
    SVC-->>UI: ok

    Note over Evaluator,DB: 評価入力（evaluator）
    Evaluator->>UI: 評価入力 Dialog（ratings + comment）
    UI->>SA: updateEvaluationAction(data)
    SA->>SVC: updateEvaluation(ctx, input)
    SVC->>SVC: authorize + evaluator 本人チェック
    Note over SVC: member は confirmed に遷移できない。<br/>確定済みの編集も admin 以上に限定
    SVC->>DB: UPDATE evaluations SET ratings, comment, status
    SVC-->>UI: ok

    Note over Admin,DB: 確定（admin）— 被評価者本人への開示スイッチ
    Admin->>SA: updateEvaluationAction({ status: 'confirmed' })
    SA->>SVC: updateEvaluation(ctx, input)
    SVC->>DB: UPDATE evaluations SET status = 'confirmed'
    Note over SVC,DB: 以降、被評価者本人にもコメントが返る<br/>（canReadEvaluationComment）
```

評価コメントの可視性は読み取り時にフィールド単位で制御している。
詳細は [認可マトリクス](../database/authorization-matrix.md)。

## 9. AI チャット

```mermaid
sequenceDiagram
    actor User
    participant UI as AI アシスタント画面
    participant API as Route Handler
    participant SVC as Service Layer
    participant DB as PostgreSQL
    participant LLM as Anthropic Claude

    User->>UI: メッセージ入力
    UI->>API: POST /api/chat (messages)
    API->>API: JWT 認証（parseJwtClaims）
    API->>SVC: テナントデータ取得（org_id 限定）
    SVC->>DB: SELECT（従業員・スキル等）
    DB-->>API: コンテキストデータ
    API->>LLM: システムプロンプト + ユーザーメッセージ
    LLM-->>UI: ストリーミングレスポンス
    Note over UI: テキストがリアルタイムで表示
```
