import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';

/**
 * 認証系 Server Actions（サインアップ / ログイン / ログアウト / パスワード再設定 / 組織切替）。
 *
 * ここは未認証のインターネットから直接叩ける唯一の入口であり、
 * アプリ全体のセキュリティ境界。以下を重点的に検証する。
 *
 *   - Zod 検証を通らない入力が Supabase Auth / DB に一切到達しないこと
 *   - ログイン失敗時に「ユーザーが存在するか」を推測できる情報を返さないこと
 *   - redirect が「成功時のみ」呼ばれること
 *     （失敗しているのに遷移すると、未認証のままアプリ内に入ってしまう）
 *   - エラーメッセージが日本語で返ること
 *
 * next/navigation の redirect は本番でも例外を投げて制御を移すので、
 * モックも同じく throw させ、呼び出し後のコードが実行されないことまで検証する。
 */

class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
    this.name = 'RedirectError';
  }
}

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new RedirectError(to);
  }),
}));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/services/auth', () => ({ createOrganizationWithOwner: vi.fn() }));

async function svc() {
  return vi.mocked(await import('@/services/auth'));
}

async function actions() {
  return import('@/app/(auth)/actions');
}

/** Supabase Auth クライアントの最小モック。実装が使うメソッドだけを持つ。 */
function mockSupabase() {
  const auth = {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    refreshSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  createClient.mockResolvedValue({ auth });
  return auth;
}

/** redirect が投げる例外を捕まえて遷移先を返す。遷移しなかった場合は失敗させる。 */
async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
  throw new Error('expected a redirect but the action returned normally');
}

const VALID_SIGNUP = { email: 'user@example.com', password: 'password123', orgName: 'Acme' };
const ORG_UUID = '11111111-1111-4111-8111-111111111111';

let auth: ReturnType<typeof mockSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new RedirectError(to);
  });
  auth = mockSupabase();
});

describe('signUp', () => {
  it('rejects a blank organization name before contacting Supabase', async () => {
    const { signUp } = await actions();

    expect(await signUp({ ...VALID_SIGNUP, orgName: '' })).toEqual(err('組織名を入力してください'));
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rejects an organization name longer than 100 characters', async () => {
    const { signUp } = await actions();

    expect(await signUp({ ...VALID_SIGNUP, orgName: 'a'.repeat(101) })).toEqual(
      err('組織名は100文字以内で入力してください'),
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('rejects an invalid email address', async () => {
    const { signUp } = await actions();

    expect(await signUp({ ...VALID_SIGNUP, email: 'nope' })).toEqual(
      err('有効なメールアドレスを入力してください'),
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    // 弱いパスワードを Supabase 側の設定任せにせず、アプリ側でも下限を持つ。
    const { signUp } = await actions();

    expect(await signUp({ ...VALID_SIGNUP, password: 'short' })).toEqual(
      err('パスワードは8文字以上で入力してください'),
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('returns the Supabase error message when account creation fails', async () => {
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    expect(await signUp(VALID_SIGNUP)).toEqual(err('User already registered'));
    // 認証に失敗している以上、組織を作ってはならない。
    expect(s.createOrganizationWithOwner).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('reports a Japanese error when Supabase succeeds but returns no user', async () => {
    // メール確認必須設定などで user が null になりうる。
    // ここで null を握らずに進むと、後段が undefined の userId で組織を作ってしまう。
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({ data: { user: null }, error: null });

    expect(await signUp(VALID_SIGNUP)).toEqual(err('ユーザーの作成に失敗しました'));
    expect(s.createOrganizationWithOwner).not.toHaveBeenCalled();
  });

  it('does not redirect when organization creation fails', async () => {
    // Auth ユーザーだけできて組織が無い状態で /login に飛ばすと、
    // ログイン後にテナント未所属の壊れた状態に入ってしまう。
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    s.createOrganizationWithOwner.mockResolvedValue(err('組織の作成に失敗しました: duplicate key'));

    expect(await signUp(VALID_SIGNUP)).toEqual(err('組織の作成に失敗しました: duplicate key'));
    expect(redirect).not.toHaveBeenCalled();
  });

  it('creates the organization for the new user and redirects to login', async () => {
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    s.createOrganizationWithOwner.mockResolvedValue(ok({ orgId: ORG_UUID }));

    const to = await captureRedirect(() => signUp(VALID_SIGNUP));

    expect(to).toBe('/login?registered=true');
    // 組織のオーナーは「今サインアップした本人」でなければならない。
    expect(s.createOrganizationWithOwner).toHaveBeenCalledWith('user-1', 'Acme');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('does not forward the organization name to Supabase Auth', async () => {
    // Auth 側には認証情報のみを渡す。業務データは Drizzle 側で持つ設計。
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    s.createOrganizationWithOwner.mockResolvedValue(ok({ orgId: ORG_UUID }));

    await captureRedirect(() => signUp(VALID_SIGNUP));

    expect(auth.signUp.mock.calls[0][0]).not.toHaveProperty('orgName');
  });
});

describe('signIn', () => {
  it('rejects an invalid email address before contacting Supabase', async () => {
    const { signIn } = await actions();

    expect(await signIn({ email: 'nope', password: 'password123' })).toEqual(
      err('有効なメールアドレスを入力してください'),
    );
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects an empty password', async () => {
    const { signIn } = await actions();

    expect(await signIn({ email: 'user@example.com', password: '' })).toEqual(
      err('パスワードを入力してください'),
    );
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns a generic Japanese message for bad credentials', async () => {
    // ユーザー列挙攻撃対策。「そのメールは存在しない」と
    // 「パスワードが違う」を区別できるメッセージを返してはならない。
    const { signIn } = await actions();
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    const result = await signIn({ email: 'user@example.com', password: 'wrong-password' });

    expect(result).toEqual(err('メールアドレスまたはパスワードが正しくありません'));
    expect(redirect).not.toHaveBeenCalled();
  });

  it('does not leak the raw credential error text to the caller', async () => {
    const { signIn } = await actions();
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    const result = await signIn({ email: 'user@example.com', password: 'wrong-password' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('Invalid login credentials');
      expect(result.error).not.toContain('user@example.com');
    }
  });

  it('surfaces other Supabase errors as-is', async () => {
    // レート制限やメール未確認など、ユーザーが対処できる情報は通す設計。
    const { signIn } = await actions();
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Email not confirmed' },
    });

    expect(await signIn({ email: 'user@example.com', password: 'password123' })).toEqual(
      err('Email not confirmed'),
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to the employee list on success', async () => {
    const { signIn } = await actions();
    auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });

    const to = await captureRedirect(() =>
      signIn({ email: 'user@example.com', password: 'password123' }),
    );

    expect(to).toBe('/employees');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });
});

describe('signOut', () => {
  it('clears the Supabase session before redirecting to login', async () => {
    // 順序が逆（先に redirect）だとセッションが残ったままになる。
    const { signOut } = await actions();

    const to = await captureRedirect(() => signOut());

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(to).toBe('/login');
    expect(auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0],
    );
  });

  it('propagates a failure from the Supabase client rather than pretending to log out', async () => {
    const { signOut } = await actions();
    auth.signOut.mockRejectedValue(new Error('network down'));

    await expect(signOut()).rejects.toThrow('network down');
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  it('rejects an invalid email address before contacting Supabase', async () => {
    const { resetPassword } = await actions();

    expect(await resetPassword({ email: 'nope' })).toEqual(
      err('有効なメールアドレスを入力してください'),
    );
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('returns ok and sends the reset mail with an in-app callback URL', async () => {
    // redirectTo が外部ドメインになるとトークンを外部に渡してしまう。
    // 自アプリの /auth/callback を指していることを確認する。
    const { resetPassword } = await actions();
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    expect(await resetPassword({ email: 'user@example.com' })).toEqual(ok(undefined));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://app.example.com/auth/callback?next=/settings',
    });
  });

  it('does not redirect — the user stays on the form to see the confirmation', async () => {
    const { resetPassword } = await actions();

    await resetPassword({ email: 'user@example.com' });

    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns the Supabase error when the mail cannot be sent', async () => {
    const { resetPassword } = await actions();
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'Email rate limit exceeded' },
    });

    expect(await resetPassword({ email: 'user@example.com' })).toEqual(
      err('Email rate limit exceeded'),
    );
  });
});

describe('switchOrg', () => {
  it('silently ignores a non-UUID organization id', async () => {
    // 戻り値の無いアクションなので、不正入力は「何もしない」で終わる設計。
    // ここで updateUser が走ると、存在しない org_id をクレームに書き込んでしまう。
    const { switchOrg } = await actions();

    await switchOrg({ orgId: 'not-a-uuid' });

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('writes the org id into user metadata, refreshes the session, then redirects', async () => {
    // リフレッシュを挟まないと、直後の RSC が古い org_id の JWT を読んでしまい
    // 切替前テナントのデータが表示されうる。順序まで検証する。
    const { switchOrg } = await actions();

    const to = await captureRedirect(() => switchOrg({ orgId: ORG_UUID }));

    expect(auth.updateUser).toHaveBeenCalledWith({ data: { org_id: ORG_UUID } });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      auth.refreshSession.mock.invocationCallOrder[0],
    );
    expect(to).toBe('/employees');
  });

  it('does not redirect when updating the user metadata throws', async () => {
    const { switchOrg } = await actions();
    auth.updateUser.mockRejectedValue(new Error('jwt expired'));

    await expect(switchOrg({ orgId: ORG_UUID })).rejects.toThrow('jwt expired');
    expect(redirect).not.toHaveBeenCalled();
  });
});
