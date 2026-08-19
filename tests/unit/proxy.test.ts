import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js のミドルウェア（src/proxy.ts）。
 *
 * 全リクエストの手前に立ち、未認証ユーザーをログイン画面へ弾く。
 * ここが素通りすると認証済み前提の画面に未認証で到達してしまうため、
 * 「委譲していること」と「どのパスに適用されるか（matcher）」を検証する。
 *
 * 認証判定そのものは updateSession（src/lib/supabase/middleware.ts）にあり、
 * tests/unit/lib-supabase-middleware.test.ts で分岐を網羅している。
 */

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }));

vi.mock('@/lib/supabase/middleware', () => ({ updateSession }));

async function mod() {
  return import('@/proxy');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('proxy', () => {
  it('リクエストをそのまま updateSession に渡す', async () => {
    const response = NextResponse.next();
    updateSession.mockResolvedValue(response);
    const request = new NextRequest('https://app.example.test/employees');

    const { proxy } = await mod();
    const result = await proxy(request);

    expect(updateSession).toHaveBeenCalledWith(request);
    // 加工せずに返すこと。ここで作り直すと updateSession が
    // 積んだ Cookie（更新後のセッション）が落ちる。
    expect(result).toBe(response);
  });

  it('updateSession が返したリダイレクトをそのまま返す', async () => {
    const redirect = NextResponse.redirect('https://app.example.test/login');
    updateSession.mockResolvedValue(redirect);

    const { proxy } = await mod();
    const result = await proxy(new NextRequest('https://app.example.test/employees'));

    expect(result).toBe(redirect);
    expect(result.status).toBe(307);
  });
});

describe('proxy の matcher', () => {
  /** config.matcher の正規表現をそのまま評価する。 */
  async function matches(pathname: string) {
    const { config } = await mod();
    return new RegExp(`^${config.matcher[0]}$`).test(pathname);
  }

  it.each([
    ['/', 'ルート'],
    ['/login', 'ログイン画面'],
    ['/employees', 'アプリ画面'],
    ['/employees/emp-1/edit', 'ネストした画面'],
    ['/auth/callback', 'メール確認コールバック'],
    ['/api/chat', 'Route Handler'],
  ])('%s は適用対象（%s）', async (pathname) => {
    expect(await matches(pathname)).toBe(true);
  });

  it.each([
    ['/_next/static/chunks/main.js', 'ビルド成果物'],
    ['/_next/image', '画像最適化エンドポイント'],
    ['/favicon.ico', 'ファビコン'],
    ['/logo.svg', 'SVG'],
    ['/hero.png', 'PNG'],
    ['/photo.jpg', 'JPG'],
    ['/photo.jpeg', 'JPEG'],
    ['/anim.gif', 'GIF'],
    ['/hero.webp', 'WebP'],
    ['/img/nested/icon.png', 'ネストした静的ファイル'],
  ])('%s は適用対象外（%s）', async (pathname) => {
    // 静的ファイルまでミドルウェアを通すと、リクエストのたびに
    // Supabase Auth へ問い合わせが飛び、無駄に遅くなる。
    expect(await matches(pathname)).toBe(false);
  });

  it('拡張子が末尾でなければ除外されない', async () => {
    // 除外パターンは末尾一致（$）。パスの途中に .png を含むだけの
    // 画面まで素通りさせないこと。
    expect(await matches('/reports/2026.png/detail')).toBe(true);
  });

  it('_next/static に前方一致しないパスは除外されない', async () => {
    expect(await matches('/_next/data/build/employees.json')).toBe(true);
  });
});
