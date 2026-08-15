# レイヤードアーキテクチャ詳細

## データフローの全体像

```
RSC / Server Actions
  → Service Layer (認可 + ビジネスロジック + 監査ログ)
    → Drizzle ORM (型安全クエリ、org_id 自動付与)
      → Supabase Postgres (RLS = テナント分離の安全網)
```

## 各レイヤーの実装指針

### 1. App Router レイヤー（`src/app/`）

- Server Component がデフォルト。`'use client'` は必要最小限
- データ取得は Service Layer を呼び出し、結果を Components に渡す
- Server Actions はフォーム送信やミューテーションの起点。バリデーション → Service呼び出し → Result返却

### 2. Service Layer（`src/services/`）

各 Service メソッドの構成：

```typescript
export async function createEmployee(ctx: AuthContext, input: CreateEmployeeInput) {
  // 1. 認可チェック
  authorize(ctx, 'create', 'employee');

  // 2. バリデーション（必要に応じて）
  const validated = createEmployeeSchema.parse(input);

  // 3. ビジネスロジック + DB操作（org_id は必ず ctx.orgId を使用）
  const [employee] = await db
    .insert(employees)
    .values({ ...validated, orgId: ctx.orgId })
    .returning();

  // 4. 監査ログ
  await auditLog(ctx, 'employee.created', employee);

  return employee;
}
```

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
