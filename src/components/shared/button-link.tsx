import type { VariantProps } from 'class-variance-authority';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * ボタンの見た目を持つリンク。
 *
 * `<Button render={<Link />}>` は使わないこと。Base UI の Button は
 * `nativeButton` の既定値 true のもとで `type="button"` を吐くが、これは
 * `<a>` には無効な属性で、dev では警告になる。かといって
 * `nativeButton={false}` にすると今度は `role="button"` が付き、リンク本来の
 * role を上書きしてしまう（遷移するのに「ボタン」と読み上げられる）。
 *
 * 遷移する要素は素の `<a>` のままスタイルだけ当てるのが正しい。
 */
export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
