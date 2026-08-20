'use client';

import { Field } from '@base-ui/react/field';

import { cn } from '@/lib/utils';

/**
 * フォーム1項目分のラッパー。ラベル・入力・エラーの aria 配線を Base UI の
 * Field に任せるためだけに存在する。
 *
 * **なぜ必要か**: 以前はエラー表示が
 * `{errors.x && <p className="text-destructive text-xs">…</p>}` という素の
 * 段落で、入力とは DOM 上の隣接関係しか無かった。`aria-invalid` も
 * `aria-describedby` もリポジトリ全体で0件で、**バリデーションエラーが
 * 支援技術に一切届いていなかった**（`ui/input.tsx` は `aria-invalid:` の
 * スタイルを持っているのに、属性を立てるコードが無く発火していなかった）。
 *
 * **なぜ手で属性を書かないか**: 13ファイル・32箇所あり、新しいフォームで
 * 必ず忘れる。実際それが0件だった理由でもある。
 *
 * **なぜ Base UI の Field で足りるか**: `ui/input.tsx` が使っている
 * `@base-ui/react/input` は中身が `Field.Control` そのもの
 * （node_modules/@base-ui/react/input/Input.mjs）。囲むだけで id と
 * aria-describedby が繋がる。Select も `SelectTrigger` が
 * `useLabelableContext()` で Field の labelId を読むため、
 * `aria-labelledby` が自動で張られる（select/trigger/SelectTrigger.mjs）。
 *
 * **id は呼び出し側が明示する。** 自動生成に任せると e2e が全滅する
 * （`tests/e2e/global-setup.ts` の `#email` / `#password` をはじめ、
 * 各スペックが `#id` セレクタでフォームを操作している）。
 */
export function FormField({
  invalid,
  className,
  ...props
}: React.ComponentProps<typeof Field.Root> & { invalid?: boolean }) {
  return (
    <Field.Root
      // react-hook-form が検証しているので Field 側の検証は使わない。
      // 妥当性は呼び出し側から invalid で伝える。
      invalid={invalid}
      className={cn('space-y-2', className)}
      {...props}
    />
  );
}

export function FormLabel({ className, ...props }: React.ComponentProps<typeof Field.Label>) {
  return (
    <Field.Label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/**
 * `match` を明示しないと出ない。react-hook-form 制御では Field 内部の
 * validityData.state.valid が false にならないため、既定の判定に任せると
 * 何も表示されない（field/error/FieldError.mjs の分岐）。
 */
export function FormError({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Field.Error>) {
  return (
    <Field.Error
      match={!!children}
      className={cn('text-destructive text-xs', className)}
      {...props}
    >
      {children}
    </Field.Error>
  );
}

export function FormDescription({
  className,
  ...props
}: React.ComponentProps<typeof Field.Description>) {
  return (
    <Field.Description className={cn('text-muted-foreground text-xs', className)} {...props} />
  );
}
