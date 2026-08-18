import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

/**
 * cn() は全 UI コンポーネントが className を組み立てる唯一の経路。
 * ここが壊れると「後から渡した className で上書きできない」という形で
 * 全画面のスタイル崩れに波及するため、衝突解決の挙動を固定しておく。
 */
describe('cn', () => {
  it('後から渡した Tailwind クラスが衝突を上書きする', () => {
    // shadcn/ui のコンポーネントは props の className を最後に結合する。
    // twMerge が効いていないと、両方のクラスが残り CSS の順序次第で表示が変わる。
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm text-red-500', 'text-blue-500')).toBe('text-sm text-blue-500');
  });

  it('衝突しないクラスは全て保持される', () => {
    expect(cn('flex', 'items-center', 'gap-2')).toBe('flex items-center gap-2');
  });

  it('falsy な値（false / null / undefined / 空文字）を除去する', () => {
    // `disabled && 'opacity-50'` のような条件付き指定が最頻出パターン。
    expect(cn('base', false, null, undefined, '')).toBe('base');
  });

  it('オブジェクト記法の条件付きクラスを解決する', () => {
    expect(cn('btn', { active: true, disabled: false })).toBe('btn active');
  });

  it('配列・ネストした配列を平坦化する', () => {
    expect(cn(['flex', ['p-2', { hidden: false }]], 'gap-1')).toBe('flex p-2 gap-1');
  });

  it('引数なし・全て falsy のときは空文字を返す', () => {
    // className={cn()} が "undefined" という文字列を吐かないことの保証。
    expect(cn()).toBe('');
    expect(cn(false, undefined, null)).toBe('');
  });

  it('条件付きクラスも衝突解決の対象になる', () => {
    // 条件分岐の結果が先勝ちになってしまうと、状態変化がUIに反映されない。
    expect(cn('p-2', { 'p-8': true })).toBe('p-8');
  });
});
