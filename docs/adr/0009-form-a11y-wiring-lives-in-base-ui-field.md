# 0009. フォームの a11y 配線は Base UI の Field に任せる

**状態**: 採用

## 背景

`aria-invalid` と `aria-describedby` が **`src/` 全体で 0 件**だった。
バリデーションエラーは全ファイルで同じ形をしていた。

```tsx
{
  errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>;
}
```

`id` を持たず、入力とは DOM 上の隣接関係しか無い。**支援技術には届かない。**
`src/components/ui/input.tsx` は `aria-invalid:` の Tailwind バリアントを
持っているのに、属性を立てるコードが無いため発火していなかった。

13ファイル・32箇所。`<Label>` の `htmlFor` 欠落も14箇所あった。

## 決定

**`src/components/shared/form-field.tsx` で Base UI の `Field` を薄く包み、
配線は Base UI に任せる。**

```tsx
<FormField invalid={!!errors.name}>
  <FormLabel htmlFor="skill-name">スキル名</FormLabel>
  <Input id="skill-name" {...register('name')} />
  <FormError>{errors.name?.message}</FormError>
</FormField>
```

## 理由

**`ui/input.tsx` が使っている `@base-ui/react/input` は、中身が `Field.Control`
そのもの**（`node_modules/@base-ui/react/input/Input.mjs`）。囲むだけで
`id` と `aria-describedby` が繋がる。

**Select も同じ**。`SelectTrigger` が `useLabelableContext()` で Field の
`labelId` を読み `aria-labelledby` を張る
（`node_modules/@base-ui/react/select/trigger/SelectTrigger.mjs:57,82`）。
`htmlFor` 欠落14件のうち Select 12件は、囲むだけで解決した。

`register` のままでよく、`Controller` への書き換えが要らない。
1項目あたりの差分は3行で済む。

## 捨てた案

| 案                                                        | 却下理由                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 各ファイルで `aria-invalid` / `aria-describedby` を手書き | 13ファイル×32箇所。新規フォームで必ず忘れる。**それが 0 件だった理由そのもの**                                                          |
| shadcn の `form.tsx` を導入                               | base-nova スタイルには**実体が無い**（レジストリの `files` が空）。Base UI の `Field` に寄せる方針で RHF ベースの Form は廃止されている |
| shadcn の `field.tsx` を導入                              | レイアウト専用で `aria-describedby` を張らない。目的（0件→全件）を達成しない                                                            |
| 独自フック `useFormField()` で属性を返す                  | Base UI が持つ機能の劣化コピー。Select は `htmlFor` ではなく `aria-labelledby` が要るため、戻り値が入力種別ごとに分岐して破綻する       |
| `id` を Base UI の自動生成に任せる                        | **e2e が全滅する。** `tests/e2e/global-setup.ts` の `#email` / `#password` を含め、各スペックが `#id` セレクタに依存している            |

## 影響

- 置き場所は `src/components/shared/`。`src/components/ui/` は
  「shadcn 自動生成・手動編集しない」方針のため
- **`FormError` は内部で `match={!!children}` を渡す必要がある。**
  react-hook-form 制御では Field 内部の `validityData.state.valid` が
  false にならず、既定の判定では何も表示されない
  （`field/error/FieldError.mjs`）
- 上流の破壊的変更を検知できるのは `tests/unit/form-field.test.tsx` だけ。
  配線を Base UI に委ねている以上、このテストを消してはならない

## スコープ外

**配色とコントラストは今回見ていない。** フォーカスリングの
`ring-ring/50` は背景比 約1.6:1 で WCAG 2.2 SC 1.4.11（3:1）を満たさず、
`--chart-*` が light/dark 共通のため片方で潰れる。いずれもデザイン変更を
伴うため別途扱う。axe を導入する際に `color-contrast` を除外しているのは
この線引きによる。

## 関連

- [UI ガイドライン](../design/ui-guidelines.md)
