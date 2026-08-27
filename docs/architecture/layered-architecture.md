# レイヤードアーキテクチャ詳細

## データフローの全体像

```
RSC / Server Actions / Route Handlers
  → Service Layer (認可 + ビジネスロジック + 監査ログ)
    → Drizzle ORM (型安全クエリ、org_id 自動付与)
      → Supabase Postgres
```

**RLS はこの経路では効かない。** Drizzle はテーブル所有者として接続するため
ポリシーが評価されない。RLS が効くのは Data API 経由だけで、そちらは権限を
剥がして閉じてある（[ADR 0011](../adr/0011-data-api-is-closed.md)）。
テナント分離は Service Layer の単独責任だと考えること。

## 各レイヤーの実装指針

### 1. App Router レイヤー（`src/app/`）

- Server Component がデフォルト。`'use client'` は必要最小限
- データ取得は Service Layer を呼び出し、結果を Components に渡す
- Server Actions はフォーム送信やミューテーションの起点。バリデーション → Service呼び出し → Result返却

### 2. Service Layer（`src/services/`）

各 Service メソッドの構成：

```typescript
export async function createEmployee(ctx: AuthContext, input: CreateEmployeeInput) {
  // 1. 認可チェック。第4引数を省くと「viewer 以外なら誰でも」になる。
  //    ロールを絞るものは必ず渡す（ここは admin 以上）
  authorize(ctx, 'create', 'employee', (c) => hasMinRole(c, 'admin'));

  // 2. DB操作（org_id は必ず ctx.orgId を使用）
  //    「存在を確かめてから書く」形は一意制約とセットにする。
  //    確認と書き込みの間に別のリクエストが入ると通り抜けるため
  const [employee] = await db
    .insert(employees)
    .values({ ...input, orgId: ctx.orgId })
    .returning();

  // 3. 監査ログ。機微フィールドの値は writeAuditLog が伏せる
  await writeAuditLog(ctx, 'employee.create', 'employee', employee.id, input);

  return ok({ id: employee.id });
}
```

**Zod による入力検証は Service ではなく Server Action 側で行う。**
`actions.ts` が `safeParse` して、通ったものだけを Service に渡す
（`pnpm check:conventions` の `action-validation` が機械的に検査する）。
Service の引数は「検証済み」を前提にした型で受ける。

### 3. Drizzle ORM レイヤー（`src/db/`）

- スキーマ定義はテーブルごとにファイル分割し、`src/db/schema/index.ts` で re-export
- クエリは Service Layer 内でのみ実行。RSC / Server Action から直接呼ばない

### 4. RLS レイヤー（`supabase/migrations/`）

- 全テーブルで有効化
- ポリシーは `org_id` チェックのみ（シンプル）
- ロール別の細かな制御は Service Layer に任せる

## 禁止事項

- RSC / Server Action から直接 Drizzle を呼ぶ（Service Layer をスキップ）
- Supabase JS Client で DB 操作（Auth / Storage 以外で使用）
- Service Layer で `ctx.orgId` 以外の org_id を使用（テナント分離違反）
