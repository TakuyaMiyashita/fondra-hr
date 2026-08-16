# TalentPulse — タレントマネジメント SaaS

## プロダクト概要

マルチテナント型のタレントマネジメントSaaS。企業が自社の従業員情報・スキル・1on1記録・評価を一元管理する。テナント分離・権限設計・監査ログの堅牢さとUIの完成度を重視したポートフォリオプロジェクト。ターゲットユーザーは中小〜中堅企業のHR部門・マネージャー。

## 技術スタック

### コアスタック（変更禁止）

- **フレームワーク**: Next.js 15 App Router / TypeScript strict / React Server Components
- **DB/BaaS**: Supabase（Postgres + Auth + Storage + RLS）
- **ORM**: Drizzle ORM + drizzle-kit（型安全DB アクセス。**Supabase JS Client でのDB操作は禁止**）
- **UI**: Tailwind CSS + shadcn/ui + lucide-react + sonner（toast）
- **データ表示**: TanStack Table（グリッド）、TanStack Query（クライアント取得）、nuqs（URL状態管理）
- **可視化**: Recharts
- **フォーム**: Zod + React Hook Form + @hookform/resolvers
- **AI**: Vercel AI SDK + @ai-sdk/anthropic
- **テスト**: Vitest + Testing Library
- **Lint/Format**: ESLint + Prettier

### 追加可能ライブラリ

以下は必要になった時点で追加可。それ以外のライブラリ追加時は理由を明示しこのファイルを更新すること。

- `@dnd-kit/core` + `@dnd-kit/sortable` — 組織図 D&D
- `next-themes` — ダークモード（追加済み）
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

## ディレクトリ構成

```
src/
├── app/                    # Next.js App Router（ページ・レイアウト）
│   ├── (auth)/             # 認証グループ（ログイン・サインアップ）
│   ├── (dashboard)/        # 認証済みグループ（アプリ本体）
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
│   ├── supabase/           # Supabase Client 初期化（client / server / middleware）
│   ├── utils.ts            # cn() 等
│   └── result.ts           # Result<T, E> 型
├── hooks/                  # カスタムフック
├── types/                  # 共有型定義
└── styles/                 # globals.css
docs/                       # 設計ドキュメント（→ docs/ の構成は下記参照）
tests/
├── unit/                   # ユニットテスト
├── integration/            # 統合テスト
└── rls/                    # RLSテスト
supabase/
├── config.toml             # Supabase ローカル設定
└── migrations/             # SQLマイグレーション
```

## 開発ルール

### DB

- 変更は必ず `supabase/migrations/` のマイグレーションファイル経由。Supabase ダッシュボードでの直接変更は禁止
- 新規テーブルには例外なく `org_id uuid not null` を持たせ、RLSを有効化し、ポリシーを定義する。RLS未設定のテーブルをマージしてはならない
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
- 全画面でローディング（Skeleton）/ 空状態（アイコン + 説明 + CTA）/ エラー状態を設計

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
  - 例: `feat: 従業員テーブルのCRUD実装`

### 品質チェック

作業完了時は必ず以下を通してから報告する：

```bash
pnpm lint && pnpm typecheck && pnpm test
```
