# FondraHR — タレントマネジメント SaaS

## プロダクト概要

マルチテナント型のタレントマネジメントSaaS。企業が自社の従業員情報・スキル・1on1記録・評価を一元管理する。テナント分離・権限設計・監査ログの堅牢さとUIの完成度を重視したポートフォリオプロジェクト。ターゲットユーザーは中小〜中堅企業のHR部門・マネージャー。

## 技術スタック

### コアスタック（変更禁止）

- **フレームワーク**: Next.js 16 App Router / TypeScript strict / React Server Components
- **DB/BaaS**: Supabase（Postgres + Auth + Storage + RLS）
- **ORM**: Drizzle ORM + drizzle-kit（型安全DB アクセス。**Supabase JS Client でのDB操作は禁止**）
- **UI**: Tailwind CSS + shadcn/ui + lucide-react + sonner（toast）
- **データ表示**: TanStack Table（グリッド）、TanStack Query（クライアント取得）、nuqs（URL状態管理）
- **可視化**: Recharts
- **フォーム**: Zod + React Hook Form + @hookform/resolvers
- **AI**: Vercel AI SDK + @ai-sdk/anthropic
- **テスト**: Vitest + Testing Library + Playwright（e2e）
- **Lint/Format**: ESLint + Prettier

### 追加可能ライブラリ

以下は必要になった時点で追加可。それ以外のライブラリ追加時は理由を明示しこのファイルを更新すること。

- `@dnd-kit/core` + `@dnd-kit/sortable` — 組織図 D&D（追加済み）
- `next-themes` — ダークモード（追加済み）
- `@testing-library/user-event` — コンポーネントテストのユーザー操作（追加済み）。
  `fireEvent` は DOM イベントを直接発火するだけで、実際のクリックに伴う
  フォーカス移動やポインタイベントの並びを再現しない。Base UI の Select /
  Popover はそれらに依存して開閉するため、`fireEvent` では検証できない
- `date-fns` — 日付操作

## アーキテクチャ

### レイヤードアーキテクチャ

```
RSC / Server Actions
  → Service Layer (認可 + ビジネスロジック + 監査ログ)
    → Drizzle ORM (型安全クエリ、org_id 自動付与)
      → Supabase Postgres (RLS = テナント分離の安全網)
```

- RSC / Server Action から直接 Drizzle を呼ばない。必ず Service Layer を経由する
- Service Layer の各メソッドは `ctx: AuthContext` を受け取り、`authorize()` → DB操作 → 監査ログの順で処理
  - 例外: 認証ブートストラップ関数（`createOrganizationWithOwner`, `getUserMemberships` 等）は AuthContext 未確定時に呼ばれるため、個別パラメータで受け取る

### テナント分離の防御多層化

- **Service Layer（主）**: 全クエリに `WHERE org_id = ctx.orgId` を必ず付与
- **RLS（安全網）**: `org_id` の単純チェックのみ。ロール別の細かな制御はRLSに持たせない
- どちらか一方が漏れてもデータは守られる設計

### Supabase Client の使い分け

| 用途 | 使用するクライアント |
|------|---------------------|
| Auth（認証・セッション） | Supabase JS Client |
| Storage（ファイル） | Supabase JS Client |
| DB アクセス（CRUD・集計） | **Drizzle ORM のみ** |
| app_metadata の更新（組織切替） | Auth Admin API（`src/lib/supabase/admin.ts`） |

`src/lib/supabase/admin.ts` は service_role キーを使い RLS を丸ごとバイパスする。
用途は Auth Admin API（JWT フックが読む `app_metadata` の更新）に限定し、
このクライアントでテーブルを読み書きしてはならない。呼ぶ前に必ずサーバー側で
メンバーシップを検証すること。

## ディレクトリ構成

```
src/
├── app/                    # Next.js App Router（ページ・レイアウト）
│   ├── (auth)/             # 認証グループ（ログイン・サインアップ・招待承認）
│   ├── (dashboard)/        # 認証済みグループ（アプリ本体）
│   ├── api/                # Route Handlers（AI チャット等）
│   ├── auth/               # Supabase Auth コールバック
│   └── layout.tsx          # ルートレイアウト（Provider群）
├── components/
│   ├── ui/                 # shadcn/ui コンポーネント（自動生成、手動編集しない）
│   ├── layout/             # アプリシェル（Sidebar, Header, OrgSwitcher）
│   └── shared/             # 業務横断の共有コンポーネント
├── db/
│   ├── index.ts            # Drizzle クライアント初期化
│   └── schema/             # Drizzle スキーマ定義（テーブルごとにファイル分割）
├── services/               # Service Layer（認可 + ビジネスロジック + 監査）
├── lib/
│   ├── supabase/           # Supabase Client 初期化（client / server / middleware / admin）
│   ├── validations/        # Zod バリデーションスキーマ（ドメインごとにファイル分割）
│   ├── utils.ts            # cn() 等
│   └── result.ts           # Result<T, E> 型
├── hooks/                  # カスタムフック
└── types/                  # 共有型定義
docs/                       # 設計ドキュメント（→ docs/ の構成は下記参照）
tests/
├── unit/                   # ユニットテスト（DB不要）
├── integration/            # 統合テスト（ローカル Supabase 必要）
├── e2e/                    # Playwright e2eテスト
├── rls/                    # RLSテスト（ローカル Supabase 必要）
└── helpers/                # 共通ハーネス（Drizzle モック・ロール別 AuthContext）
supabase/
├── config.toml             # Supabase ローカル設定
└── migrations/             # SQLマイグレーション
.claude/
└── hooks/                  # テスト更新を促す/強制するフック（→ テスト の節参照）
```

## 開発ルール

### DB

- 変更は必ず `supabase/migrations/` のマイグレーションファイル経由。Supabase ダッシュボードでの直接変更は禁止
- 新規テーブルには `org_id uuid not null` を持たせ、RLSを有効化し、ポリシーを定義する。RLS未設定のテーブルをマージしてはならない
  - 例外: テナントインフラテーブル（`organizations`, `memberships`, `invitations`）は org_id を外部キーとして持つか、テーブル自体がテナントの定義であるため、このルールの対象外
- Drizzle スキーマ定義を `src/db/schema/` に配置し、マイグレーションと同期を保つ

### 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| DB テーブル | snake_case, 複数形 | `employee_skills` |
| DB カラム | snake_case | `full_name_kana` |
| TypeScript | camelCase | `fullNameKana` |
| React コンポーネント | PascalCase | `EmployeeTable` |
| ファイル名（コンポーネント） | kebab-case | `employee-table.tsx` |

### コンポーネント設計

- Server Component をデフォルト。`'use client'` は必要最小限
- ミューテーションは必ず Service Layer 経由（Zod バリデーション + `authorize()` + 監査ログ）

### エラーハンドリング

- Server Actions: `Result<T, E>` 型（`src/lib/result.ts`）で返す
- UI: sonner toast でフィードバック

### UI/UX

- `docs/design/ui-guidelines.md` に従う
- データ取得を行う画面には `loading.tsx`（Skeleton）と `error.tsx` を必ず配置する
- 空状態（アイコン + 説明 + CTA）は全画面で設計する
- プレースホルダーページ（実データ取得未実装）には loading/error は不要。実データ取得の実装時に追加する

### 設計ドキュメント

- 設計判断は `docs/` 配下に文書化する
- 実装コードだけでなく設計書もPR成果物に含める

### ブランチ運用

- `main` は保護ブランチ。直接コミット禁止
- 作業ブランチを切り、PR 経由で `main` にマージする
- ブランチ命名: `<type>/<短い説明>` (kebab-case)
  - 例: `feat/phase-1b-domain-schema`, `fix/rls-policy-bug`, `docs/er-diagram-update`
  - type は Conventional Commits と同じ: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

### コミット

- Conventional Commits 規約（`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`）
- コミットメッセージは日本語で書く（prefix は英語のまま）
  - 例: `feat: 従業員一覧画面の実装`, `fix: RLSポリシーの修正`

### テスト

テストは3つの project に分かれている。詳細な方針は `docs/testing.md` を参照。

| コマンド                | 対象                                                    | ローカル Supabase |
| ----------------------- | ------------------------------------------------------- | ----------------- |
| `pnpm test:unit`        | Service Layer / Server Actions / Zod / ユーティリティ    | 不要              |
| `pnpm test:coverage`    | 上記 + カバレッジ計測（閾値チェック付き）                | 不要              |
| `pnpm test:integration` | Supabase Auth の認証フロー                              | 必要              |
| `pnpm test:rls`         | RLS ポリシーによるテナント分離                          | 必要              |
| `pnpm test:e2e`         | 画面操作（Playwright）                                  | 必要              |
| `pnpm test`             | unit + integration + rls                                | 必要              |

カバレッジ閾値は `vitest.config.ts` の `coverage.thresholds` で定義しており、
下回ると CI が落ちる。**達成した水準は下げない**（現状: statements / functions /
lines 100%、branches 99）。計測対象は `src/services/` `src/lib/`
`src/app/**/actions.ts` に限定している。

`src/` のプロダクトコードを変更したら、対応するテストも同じ変更に含める。
`.claude/hooks/` の2つのフックがこれを補助する。

- **PostToolUse**（`test-reminder.sh`）— `src/` を編集すると、対応するテスト
  ファイルを名指しで提示する。判定のみでテストは実行しない
- **Stop**（`verify-tests.sh`）— ターン終了前に `pnpm test:coverage` を実行し、
  失敗していればブロックする。`src/` と `tests/` に変更が無ければ即終了する

### 品質チェック

作業完了時は必ず以下を通してから報告する：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

`pnpm test` は integration / rls を含むため、ローカル Supabase の起動
（`npx supabase start`）が前提。起動していない場合は `pnpm test:coverage` で
unit のみ回し、残りは CI に任せる。

### フェーズ完了チェックリスト

上記の品質チェックに加え、フェーズ完了前に以下を確認する：

- [ ] CLAUDE.md の技術スタック・ディレクトリ構成が実態と一致しているか
- [ ] 新規 Server Action に Zod バリデーションが実装されているか
- [ ] データ取得を行う新規ページに `loading.tsx` / `error.tsx` が配置されているか
- [ ] 新規テーブルに RLS ポリシーが定義されているか
- [ ] 設計ドキュメント（`docs/`）が更新されているか
- [ ] 変更した `src/` のコードに対応するテストが更新されているか
- [ ] カバレッジ閾値を下回っていないか（`pnpm test:coverage`）
- [ ] 機密情報（`.env`、APIキー、社名等）がコミットに含まれていないか

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
