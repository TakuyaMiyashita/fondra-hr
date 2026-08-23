import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * ミドルウェアの認証判定（src/proxy.ts が委譲する先）。
 *
 * 全リクエストの手前で「未認証をアプリ内に入れない」「認証済みを
 * ログイン画面に留めない」を決めている箇所であり、アプリ全体の
 * アクセス制御の一次防壁。以下を網羅する。
 *
 *   - 未認証 × 保護パス → /login へリダイレクト
 *   - 未認証 × 公開パス（前方一致）／ルート → 素通り
 *   - 認証済み × /login・/signup → /dashboard へ
 *   - Supabase が更新した Cookie がレスポンスに載ること
 *     （ここが落ちるとセッションが更新されずログアウトを繰り返す）
 */

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock('@supabase/ssr', () => ({ createServerClient }));

type CookieHandlers = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => void;
};

let handlers: CookieHandlers | undefined;

type User = { id: string } | null;

/**
 * Supabase クライアントの最小モック。
 *
 * onGetUser は「getUser の最中に Cookie が書き戻される」実際の挙動を
 * 再現するためのフック（セッション更新時に setAll が呼ばれる）。
 */
function mockSupabase(user: User, onGetUser?: (h: CookieHandlers) => void) {
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieHandlers }) => {
      handlers = options.cookies;
      return {
        auth: {
          getUser: vi.fn(async () => {
            onGetUser?.(options.cookies);
            return { data: { user } };
          }),
        },
      };
    },
  );
}

async function updateSession(pathname: string, init?: { headers?: Record<string, string> }) {
  const { updateSession: fn } = await import('@/lib/supabase/middleware');
  return fn(new NextRequest(`https://app.example.test${pathname}`, init));
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  handlers = undefined;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('updateSession', () => {
  describe('未認証', () => {
    beforeEach(() => mockSupabase(null));

    it.each([
      ['/employees', 'アプリ画面'],
      ['/dashboard', 'ダッシュボード'],
      ['/settings/members', 'ネストした画面'],
      // 公開パスの判定はセグメント単位。前方一致だと、公開パスに似た名前の
      // ルートを将来足したときに認証を素通りしてしまう。
      ['/loginish', '公開パスに似た別ルート'],
      ['/signupx', '公開パスに似た別ルート（接尾辞つき）'],
      ['/invitations', '公開パス /invite の前方一致に引っかかる別ルート'],
    ])('%s は /login へリダイレクトする（%s）', async (pathname) => {
      const res = await updateSession(pathname);

      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    });

    it('リダイレクト時もオリジンとクエリを保つ', async () => {
      const res = await updateSession('/employees?page=2');
      const location = new URL(res.headers.get('location')!);

      expect(location.origin).toBe('https://app.example.test');
      expect(location.searchParams.get('page')).toBe('2');
    });

    it.each([
      ['/login', 'ログイン'],
      ['/signup', 'サインアップ'],
      ['/reset-password', 'パスワード再設定'],
      ['/auth/callback', 'メール確認コールバック'],
      ['/invite', '招待受諾'],
      ['/invite/abc-token', '子パス（トークン付き招待 URL）'],
      ['/auth/callback/nested', '子パス'],
      ['/', 'ルート（ランディング）'],
    ])('%s は素通りさせる（%s）', async (pathname) => {
      const res = await updateSession(pathname);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('認証済み', () => {
    beforeEach(() => mockSupabase({ id: 'user-1' }));

    it.each([
      ['/login', 'ログイン画面'],
      ['/signup', 'サインアップ画面'],
    ])('%s に来たら /dashboard へ送る（%s）', async (pathname) => {
      const res = await updateSession(pathname);

      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it.each([
      ['/reset-password', '認証ページだが再設定は許可する'],
      ['/employees', 'アプリ画面'],
      ['/', 'ルート'],
      ['/login/help', '前方一致では飛ばさない（完全一致のみ）'],
    ])('%s はそのまま通す（%s）', async (pathname) => {
      const res = await updateSession(pathname);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('Cookie の受け渡し', () => {
    it('リクエストの Cookie を Supabase に渡す', async () => {
      mockSupabase({ id: 'user-1' });

      await updateSession('/employees', { headers: { cookie: 'sb-access-token=old' } });

      expect(handlers!.getAll()).toEqual(
        expect.arrayContaining([{ name: 'sb-access-token', value: 'old' }]),
      );
    });

    it('Supabase が更新した Cookie をレスポンスに載せる', async () => {
      // ここが落ちるとセッションが更新されず、期限切れのたびに
      // ログアウトさせられる。
      mockSupabase({ id: 'user-1' }, (h) =>
        h.setAll([
          { name: 'sb-access-token', value: 'refreshed', options: { path: '/', httpOnly: true } },
        ]),
      );

      const res = await updateSession('/employees', {
        headers: { cookie: 'sb-access-token=old' },
      });

      const cookie = res.cookies.get('sb-access-token');
      expect(cookie?.value).toBe('refreshed');
      expect(cookie?.httpOnly).toBe(true);
      // 後続のハンドラが読むのはリクエスト側の Cookie なので、こちらも更新する。
      expect(handlers!.getAll()).toEqual(
        expect.arrayContaining([{ name: 'sb-access-token', value: 'refreshed' }]),
      );
    });

    it('Cookie 更新後にリダイレクトする場合は更新分を持ち越さない', async () => {
      // 未認証なら結局ログイン画面へ送るので、更新後のレスポンスは破棄される。
      mockSupabase(null, (h) => h.setAll([{ name: 'sb-access-token', value: 'refreshed' }]));

      const res = await updateSession('/employees');

      expect(res.status).toBe(307);
    });
  });

  it('Supabase の URL と anon key を環境変数から渡す', async () => {
    mockSupabase({ id: 'user-1' });

    await updateSession('/employees');

    expect(createServerClient).toHaveBeenCalledWith(
      'https://project.supabase.test',
      'anon-key',
      expect.anything(),
    );
  });
});
