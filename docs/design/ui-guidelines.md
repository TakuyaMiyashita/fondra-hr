# UIデザインガイドライン

## デザインの方向性

Linear / Vercel Dashboard / Notion のようなモダンSaaSのデザイン言語を採用する。

### 原則

1. **余白を十分に取る** — 詰め込まない。情報密度より視認性を優先
2. **色の抑制** — ベースは neutral 系。アクセントカラーは primary のみ。semantic color は意味のある場面でのみ
3. **一貫性** — 同じパターンには同じコンポーネントを使う。独自実装より shadcn/ui を優先

## デザイントークン

### カラー

shadcn/ui の CSS 変数をそのまま使用する（`globals.css` で定義済み）。

| 用途 | 変数 | 使用場面 |
|------|------|----------|
| 背景 | `--background` | ページ全体の背景 |
| テキスト | `--foreground` | 本文テキスト |
| 補足テキスト | `--muted-foreground` | 日付・補足情報・プレースホルダー |
| Primary | `--primary` | CTA ボタン・リンク・アクティブ状態 |
| Destructive | `--destructive` | 削除ボタン・エラー表示 |
| Border | `--border` | カード・テーブル・入力フィールドの枠線 |
| Accent | `--accent` | ホバー背景・選択状態 |
| Chart 1-5 | `--chart-1` 〜 `--chart-5` | グラフの配色 |

### タイポグラフィ

| 要素 | クラス | 用途 |
|------|--------|------|
| ページタイトル | `text-2xl font-bold tracking-tight` | 各ページの最上部 |
| セクション見出し | `text-lg font-semibold` | カード内のセクション見出し |
| 本文 | `text-sm` | テーブルセル・フォームラベル・一般テキスト |
| 補足 | `text-xs text-muted-foreground` | タイムスタンプ・ヘルプテキスト |

### スペーシング

| コンテキスト | 値 |
|--------------|-----|
| ページのパディング | `p-6` (24px) |
| カード内パディング | `p-4` (16px) or `p-6` (24px) |
| セクション間 | `space-y-6` (24px) |
| フォームフィールド間 | `space-y-4` (16px) |
| インライン要素間 | `gap-2` (8px) |

### コーナー半径

shadcn/ui の `--radius: 0.625rem` を基準。個別指定は避け、shadcn/ui コンポーネントのデフォルトに従う。

## コンポーネント使用ルール

### ボタン

| バリアント | 用途 |
|-----------|------|
| `default` | 主要アクション（保存・作成・送信） |
| `secondary` | 副次アクション（キャンセル・フィルタリセット） |
| `outline` | テーブル行内のアクション |
| `destructive` | 削除・破壊的操作 |
| `ghost` | ナビゲーション・アイコンボタン |

### フォーム

- ラベルは必ず付ける。プレースホルダーのみの入力フィールドは禁止
- バリデーションエラーはフィールド直下にインラインで `text-destructive text-xs` で表示
- 送信中はボタンに `disabled` + ローディングインジケーター

### テーブル（TanStack Table）

- 行ホバーで `hover:bg-muted/50` の背景色変化
- 固定ヘッダー（`sticky top-0`）
- ページネーション・ソート・フィルタ状態は nuqs で URL に永続化

### カード

- `<Card>` コンポーネントで統一
- タイトルには `<CardHeader>` + `<CardTitle>`

## 状態表現

### ローディング

- Skeleton コンポーネントで実際のレイアウトを模倣する形状
- `loading.tsx` で Next.js の Suspense boundary を活用
- 汎用スピナーは最終手段（インラインの小さな操作のみ）

### 空状態

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <Icon className="h-12 w-12 text-muted-foreground/50" />
  <h3 className="mt-4 text-lg font-semibold">タイトル</h3>
  <p className="mt-2 text-sm text-muted-foreground">説明文</p>
  <Button className="mt-6">CTAボタン</Button>
</div>
```

### エラー状態

- `error.tsx` で Suspense Error Boundary を活用
- 「何が起きたか」+「どうすればいいか」を明示
- 「エラーが発生しました」だけは禁止

### 成功フィードバック

- `sonner` の `toast.success()` で即座にフィードバック
- 例: `toast.success('従業員を登録しました')`

## アニメーション

- ページ遷移・モーダル開閉: CSS `transition` または shadcn/ui 組み込みアニメーション
- リスト項目の追加・削除: `animate-in` / `animate-out`
- 原則 300ms 以下。ユーザーの操作を遅延させない

## ダークモード

- `next-themes` で管理
- ライト/ダークの両方を最初から設計する
- `globals.css` の `:root` と `.dark` で CSS 変数を定義済み
- 画像・アイコンが両モードで視認できることを確認

## アクセシビリティ

- キーボードナビゲーション対応（Tab / Enter / Escape）
- カラーコントラスト比 WCAG AA 準拠
- フォーカスリングの視認性確保（`outline-ring/50` で定義済み）
- インタラクティブ要素に適切な `aria-label`

## レスポンシブ

| ブレークポイント | 対応 |
|-----------------|------|
| < 768px (mobile) | サイドナビ → Sheet、テーブル → 水平スクロール |
| 768px - 1024px (tablet) | サイドナビ折りたたみ（アイコンのみ） |
| > 1024px (desktop) | フル表示 |
