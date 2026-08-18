import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/lib/auth.ts` はアプリ全体の認証境界。
 *
 * - `parseJwtClaims` は Supabase の access_token から org_id / role を取り出す。
 *   ここで壊れた JWT や claims 欠落を通してしまうと、テナント分離そのものが崩れる。
 * - `getAuthContext` は未認証・セッション切れ・claims 欠落のいずれでも
 *   必ず /login にリダイレクトしなければならない（フォールスルー禁止）。
 *
 * 本番の `redirect()` は例外を投げて以降の処理を止める。モックが素通りすると
 * 「リダイレクトしたつもりで処理が続く」バグをテストが見逃すため、
 * モックでも同様に throw させて実挙動を再現する。
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

type FakeUser = { id: string } | null;
type FakeSession = { access_token: string } | null;

/** ヘッダ.ペイロード.署名 形式の JWT を組み立てる（署名は検証されない）。 */
function makeToken(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${body}.signature`;
}

async function mockSupabase(opts: { user?: FakeUser; session?: FakeSession }) {
  const { createClient } = await import('@/lib/supabase/server');
  const getUser = vi.fn().mockResolvedValue({ data: { user: opts.user ?? null } });
  const getSession = vi.fn().mockResolvedValue({ data: { session: opts.session ?? null } });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser, getSession },
  } as never);
  return { getUser, getSession };
}

async function getRedirectMock() {
  const { redirect } = await import('next/navigation');
  return vi.mocked(redirect);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseJwtClaims', () => {
  it('app_metadata から org_id と role を取り出す', async () => {
    const { parseJwtClaims } = await import('@/lib/auth');

    const token = makeToken({
      sub: 'user-1',
      app_metadata: { org_id: 'org-1', role: 'admin' },
    });

    expect(parseJwtClaims(token)).toEqual({ orgId: 'org-1', role: 'admin' });
  });

  it('app_metadata 自体が無い JWT では null を返す', async () => {
    // Supabase のカスタムクレームフックが未設定/失敗したケース。
    // ここで null を返さないと org_id undefined のまま全クエリが走ってしまう。
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(parseJwtClaims(makeToken({ sub: 'user-1' }))).toBeNull();
  });

  it('org_id が欠落している場合は null を返す', async () => {
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(parseJwtClaims(makeToken({ app_metadata: { role: 'admin' } }))).toBeNull();
  });

  it('role が欠落している場合は null を返す', async () => {
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(parseJwtClaims(makeToken({ app_metadata: { org_id: 'org-1' } }))).toBeNull();
  });

  it('org_id / role が空文字の場合も null を返す', async () => {
    // 空文字は falsy。`WHERE org_id = ''` が実行されてしまう事態を防ぐ。
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(parseJwtClaims(makeToken({ app_metadata: { org_id: '', role: 'admin' } }))).toBeNull();
    expect(parseJwtClaims(makeToken({ app_metadata: { org_id: 'org-1', role: '' } }))).toBeNull();
  });

  it('app_metadata が null でも例外を投げずに null を返す', async () => {
    // オプショナルチェーンが効いていることの確認。
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(parseJwtClaims(makeToken({ app_metadata: null }))).toBeNull();
  });

  it('未知のロール文字列もそのまま通す（型検証は行っていない）', async () => {
    // 現状の実装は role の値域を検証しない。JWT 発行側（Supabase のフック）が
    // 唯一の防衛線であることを、意図した仕様としてテストで固定しておく。
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(parseJwtClaims(makeToken({ app_metadata: { org_id: 'org-1', role: 'root' } }))).toEqual({
      orgId: 'org-1',
      role: 'root',
    });
  });

  it('ドット区切りでない文字列を渡すと例外を投げる（現状の挙動）', async () => {
    // 実装は try/catch していないため、壊れたトークンは例外になる。
    // 呼び出し側が catch していないと 500 になるため、挙動を明示的に固定する。
    const { parseJwtClaims } = await import('@/lib/auth');

    expect(() => parseJwtClaims('not-a-jwt')).toThrow();
  });

  it('ペイロードが JSON でない JWT では例外を投げる（現状の挙動）', async () => {
    const { parseJwtClaims } = await import('@/lib/auth');

    const broken = `header.${Buffer.from('this-is-not-json').toString('base64url')}.sig`;
    expect(() => parseJwtClaims(broken)).toThrow(SyntaxError);
  });
});

describe('getAuthContext', () => {
  it('user / session / claims が揃っていれば AuthContext を返す', async () => {
    const { getAuthContext } = await import('@/lib/auth');

    await mockSupabase({
      user: { id: 'user-1' },
      session: { access_token: makeToken({ app_metadata: { org_id: 'org-1', role: 'owner' } }) },
    });

    await expect(getAuthContext()).resolves.toEqual({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'owner',
    });

    const redirect = await getRedirectMock();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('未認証（user なし）なら /login にリダイレクトする', async () => {
    const { getAuthContext } = await import('@/lib/auth');

    const { getSession } = await mockSupabase({ user: null });

    await expect(getAuthContext()).rejects.toThrow('NEXT_REDIRECT:/login');

    const redirect = await getRedirectMock();
    expect(redirect).toHaveBeenCalledWith('/login');
    // user が無い時点で打ち切られ、セッション取得まで進まないこと。
    expect(getSession).not.toHaveBeenCalled();
  });

  it('user はあるがセッションが無い場合も /login にリダイレクトする', async () => {
    const { getAuthContext } = await import('@/lib/auth');

    await mockSupabase({ user: { id: 'user-1' }, session: null });

    await expect(getAuthContext()).rejects.toThrow('NEXT_REDIRECT:/login');

    const redirect = await getRedirectMock();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('JWT に org_id / role が無い場合は AuthContext を組まずリダイレクトする', async () => {
    // 一番危険な経路。ここを通してしまうと orgId undefined のコンテキストが
    // Service Layer に流れ、テナント分離が無効化される。
    const { getAuthContext } = await import('@/lib/auth');

    await mockSupabase({
      user: { id: 'user-1' },
      session: { access_token: makeToken({ app_metadata: {} }) },
    });

    await expect(getAuthContext()).rejects.toThrow('NEXT_REDIRECT:/login');

    const redirect = await getRedirectMock();
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('getOptionalUser', () => {
  it('ログイン済みなら user を返す', async () => {
    const { getOptionalUser } = await import('@/lib/auth');

    await mockSupabase({ user: { id: 'user-1' } });

    await expect(getOptionalUser()).resolves.toEqual({ id: 'user-1' });
  });

  it('未ログインなら null を返し、リダイレクトはしない', async () => {
    // ランディングページ用。ここでリダイレクトすると未ログイン閲覧ができなくなる。
    const { getOptionalUser } = await import('@/lib/auth');

    await mockSupabase({ user: null });

    await expect(getOptionalUser()).resolves.toBeNull();

    const redirect = await getRedirectMock();
    expect(redirect).not.toHaveBeenCalled();
  });
});
