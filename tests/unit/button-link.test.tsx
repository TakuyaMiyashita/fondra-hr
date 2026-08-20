import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ButtonLink } from '@/components/shared/button-link';
import { Button } from '@/components/ui/button';

/**
 * `<Button render={<Link />}>` を使うと Base UI が壊れた属性を足す。
 * ここはその回帰を止めるための契約テスト。
 *
 * - 既定（nativeButton = true）… `<a>` に `type="button"` が付く。`<a>` に
 *   `type` は無効な属性で、dev では警告になる
 * - `nativeButton={false}` … 今度は `role="button"` が付き、リンク本来の role を
 *   上書きする。遷移する要素が「ボタン」と読み上げられてしまう
 *
 * どちらも不正解なので、遷移する要素は素の `<a>` にスタイルだけ当てる。
 */
describe('ButtonLink', () => {
  it('リンクとして描画され、href を持つ', () => {
    render(<ButtonLink href="/employees">従業員一覧</ButtonLink>);

    expect(screen.getByRole('link', { name: '従業員一覧' })).toHaveAttribute('href', '/employees');
  });

  it('`<a>` に無効な type 属性を付けない', () => {
    render(<ButtonLink href="/employees">従業員一覧</ButtonLink>);

    expect(screen.getByRole('link', { name: '従業員一覧' })).not.toHaveAttribute('type');
  });

  it('リンクの role を button で上書きしない', () => {
    render(<ButtonLink href="/employees">従業員一覧</ButtonLink>);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('variant / size のスタイルが当たる', () => {
    render(
      <ButtonLink href="/x" variant="ghost" size="sm" className="mt-8">
        リンク
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'リンク' });

    // ghost の hover 色と sm の高さ、および呼び出し側の className が共存する
    expect(link).toHaveClass('hover:bg-muted', 'h-7', 'mt-8');
  });

  it('アイコンのみでも aria-label で名前を与えられる', () => {
    render(
      <ButtonLink href="/employees" aria-label="従業員一覧に戻る">
        <svg />
      </ButtonLink>,
    );

    expect(screen.getByRole('link', { name: '従業員一覧に戻る' })).toBeInTheDocument();
  });

  /**
   * 「なぜ Button を使ってはいけないか」を実際の DOM で示しておく。
   * Base UI の実装が変わってこれが落ちたら、ButtonLink の要否を見直す合図。
   */
  it('比較: Button の render prop はリンクに type="button" を足してしまう', () => {
    // 内部リンクにすると Next.js の no-html-link-for-pages に触れるため外部 URL を使う。
    // 検証したいのは「<a> に type が付くこと」なので遷移先は本質ではない。
    render(
      <Button render={<a href="https://example.com">壊れた例</a>}>
        <span />
      </Button>,
    );

    expect(screen.getByRole('link', { name: '壊れた例' })).toHaveAttribute('type', 'button');
  });
});
