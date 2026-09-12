import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/auth/signout`。
 *
 * **RSC から `/login` へ直接リダイレクトするとループする。** Supabase の認証
 * 自体は生きているため、ミドルウェアが「認証済み」と見てダッシュボードへ
 * 戻してしまう。cookie を消せるのは Route Handler だけなので、ここで実際に
 * サインアウトしてからログイン画面へ送る。
 */

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient }));

const signOut = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
  createClient.mockResolvedValue({ auth: { signOut } });
});

function request(url = 'http://localhost:3000/auth/signout') {
  return new Request(url);
}

describe('GET /auth/signout', () => {
  it('サインアウトしてからログイン画面へ送る', async () => {
    const { GET } = await import('@/app/auth/signout/route');

    const res = await GET(request());

    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
  });

  it('理由をクエリに載せる', async () => {
    // 黙ってログイン画面に戻されると、利用者には何が起きたか分からない。
    const { GET } = await import('@/app/auth/signout/route');

    const res = await GET(request());

    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('reason')).toBe('membership-revoked');
  });

  it('元の URL のクエリを引き継がない', async () => {
    // 取り消された組織の id などが残ると、ログイン画面に無関係な値が出る。
    const { GET } = await import('@/app/auth/signout/route');

    const res = await GET(
      request('http://localhost:3000/auth/signout?next=%2Femployees&org=secret'),
    );

    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('next')).toBeNull();
    expect(location.searchParams.get('org')).toBeNull();
  });
});
