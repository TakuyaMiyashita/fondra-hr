import { describe, expect, it } from 'vitest';

import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from '@/lib/safe-redirect';

/**
 * リダイレクト先の検証（オープンリダイレクト対策）。
 *
 * `${origin}${next}` の連結だと `next=@evil.example` などで外部ドメインへ
 * 飛ばせてしまう。相対パスだけを許し、それ以外は既定値に落とすことを固定する。
 */

const ORIGIN = 'https://app.example.test';

describe('safeRedirectPath', () => {
  it.each([
    ['/settings', '/settings'],
    ['/employees/123', '/employees/123'],
    ['/employees?page=2&sort=fullName', '/employees?page=2&sort=fullName'],
    ['/settings#members', '/settings#members'],
  ])('相対パス %s はそのまま通す', (input, expected) => {
    expect(safeRedirectPath(input, ORIGIN)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空文字', ''],
  ])('%s なら既定値', (_label, input) => {
    expect(safeRedirectPath(input, ORIGIN)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it.each([
    // 連結すると https://app.example.test@evil.example（ホストは evil.example）
    ['@evil.example'],
    // 連結すると https://app.example.test.evil.example
    ['.evil.example'],
    ['evil.example'],
    // プロトコル相対 URL
    ['//evil.example'],
    ['//evil.example/path'],
    // ブラウザは \ を / と同一視する
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
  ])('%s は既定値に落とす', (input) => {
    expect(safeRedirectPath(input, ORIGIN)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('URL 解析で取り除かれる文字を挟んで // を作る入力も既定値に落とす', () => {
    // 先頭の判定は通るが、URL パーサがタブを除去すると //evil.example になる。
    // 文字列の見た目だけでなく、組み立てた結果のオリジンでも確かめる。
    expect(safeRedirectPath('/\t/evil.example', ORIGIN)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('URL を組み立てられなければ既定値に落とす', () => {
    expect(safeRedirectPath('/settings', 'not a url')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('既定値は差し替えられる', () => {
    expect(safeRedirectPath('//evil.example', ORIGIN, '/dashboard')).toBe('/dashboard');
  });
});
