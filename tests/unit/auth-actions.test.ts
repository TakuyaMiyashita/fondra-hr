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
const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('@/services/auth', () => ({
  createOrganizationWithOwner: vi.fn(),
  switchOrganization: vi.fn(),
}));

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
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
  };
  createClient.mockResolvedValue({ auth });
  return auth;
}

/**
 * service_role の Auth Admin API のモック。
 *
 * 組織切替は app_metadata を書き換えるためにこれを通る。JWT フックが読むのは
 * app_metadata なので、ここが呼ばれない = 切り替わらない、が回帰の形になる。
 */
function mockAdmin() {
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
  createAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });
  return updateUserById;
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
const OTHER_ORG_UUID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

let auth: ReturnType<typeof mockSupabase>;
let updateUserById: ReturnType<typeof mockAdmin>;

beforeEach(() => {
  vi.clearAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new RedirectError(to);
  });
  auth = mockSupabase();
  updateUserById = mockAdmin();
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

  it('creates the organization for the new user, then refreshes and enters the app', async () => {
    // メール確認が無効な場合、signUp はセッションを返す。
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'stale' } },
      error: null,
    });
    s.createOrganizationWithOwner.mockResolvedValue(ok({ orgId: ORG_UUID }));

    const to = await captureRedirect(() => signUp(VALID_SIGNUP));

    expect(to).toBe('/dashboard');
    // 組織のオーナーは「今サインアップした本人」でなければならない。
    expect(s.createOrganizationWithOwner).toHaveBeenCalledWith('user-1', 'Acme');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  /**
   * リダイレクトループの回帰テスト。
   *
   * signUp() が返すセッションは「組織を作る前」に発行されており、その時点では
   * メンバーシップが無いので JWT フックが app_metadata.org_id / role に null を
   * 書き込む。このトークンのまま画面に入ると、
   *
   *   /dashboard → getAuthContext() が claim を読めず /login へ
   *   /login     → ミドルウェアが認証済みとみなし /dashboard へ
   *
   * を延々と往復し、トークンが失効する1時間まで画面が真っ暗になる。
   * 実際に検証環境で発生した不具合。
   *
   * 防ぐ条件は「組織を作った後にリフレッシュすること」の一点なので、
   * 呼び出し順序まで検証する。
   */
  it('refreshes the session only after the organization exists', async () => {
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'stale' } },
      error: null,
    });
    s.createOrganizationWithOwner.mockResolvedValue(ok({ orgId: ORG_UUID }));

    await captureRedirect(() => signUp(VALID_SIGNUP));

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(s.createOrganizationWithOwner.mock.invocationCallOrder[0]).toBeLessThan(
      auth.refreshSession.mock.invocationCallOrder[0],
    );
  });

  it('does not refresh when the organization could not be created', async () => {
    // 組織が無いままリフレッシュしても claim は入らない。失敗時は画面に入れない。
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'stale' } },
      error: null,
    });
    s.createOrganizationWithOwner.mockResolvedValue(err('組織の作成に失敗しました'));

    await signUp(VALID_SIGNUP);

    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends the user to login without refreshing when email confirmation is required', async () => {
    // メール確認が有効だと signUp はセッションを返さない。
    // リフレッシュ対象が無いので確認を促すためログイン画面へ送る。
    const { signUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: null },
      error: null,
    });
    s.createOrganizationWithOwner.mockResolvedValue(ok({ orgId: ORG_UUID }));

    const to = await captureRedirect(() => signUp(VALID_SIGNUP));

    expect(to).toBe('/login?registered=true');
    expect(auth.refreshSession).not.toHaveBeenCalled();
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
  /**
   * 組織切替は「所属していない組織の JWT を発行させない」ことが本体。
   * app_metadata はクライアントから書けない領域なので、更新は RLS を
   * バイパスする service_role 経由になる。だからこそ、書き込む手前で
   * メンバーシップ検証が必ず走ることを分岐ごとに検証する。
   */
  beforeEach(async () => {
    (await svc()).switchOrganization.mockResolvedValue(ok({ orgId: ORG_UUID, role: 'admin' }));
  });

  it('rejects a non-UUID organization id before touching Supabase', async () => {
    const { switchOrg } = await actions();

    expect(await switchOrg({ orgId: 'not-a-uuid' })).toEqual(err('無効な組織IDです'));
    expect((await svc()).switchOrganization).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects when there is no signed-in user', async () => {
    const { switchOrg } = await actions();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await switchOrg({ orgId: ORG_UUID })).toEqual(err('ログインが必要です'));
    expect((await svc()).switchOrganization).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('refuses to switch into an organization the user does not belong to', async () => {
    // 権限昇格の本丸。ここで app_metadata を書くと、所属していないテナントの
    // JWT が発行され、Service Layer も RLS も「正規の org_id」として信じてしまう。
    const { switchOrg } = await actions();
    (await svc()).switchOrganization.mockResolvedValue(err('この組織へのアクセス権がありません'));

    expect(await switchOrg({ orgId: OTHER_ORG_UUID })).toEqual(
      err('この組織へのアクセス権がありません'),
    );
    expect(updateUserById).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('verifies the membership with the signed-in user id, not a client-supplied one', async () => {
    const { switchOrg } = await actions();

    await captureRedirect(() => switchOrg({ orgId: ORG_UUID }));

    expect((await svc()).switchOrganization).toHaveBeenCalledWith(USER_ID, ORG_UUID);
  });

  it('writes org_id into app_metadata, refreshes the session, then redirects', async () => {
    // user_metadata ではなく app_metadata であることが要。JWT フック
    // (custom_access_token_hook) が読むのは app_metadata 側だけで、
    // user_metadata に書いても組織は切り替わらない（実機で確認済みの回帰）。
    const { switchOrg } = await actions();

    const to = await captureRedirect(() => switchOrg({ orgId: ORG_UUID }));

    expect(updateUserById).toHaveBeenCalledWith(USER_ID, {
      app_metadata: { org_id: ORG_UUID, role: 'admin' },
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(to).toBe('/employees');
  });

  it('writes the org id returned by the membership check, not the raw input', async () => {
    // 検証済みの値だけを信頼する。入力をそのまま書き戻す実装だと、
    // 検証を通した意味が無くなる。
    const { switchOrg } = await actions();
    (await svc()).switchOrganization.mockResolvedValue(ok({ orgId: ORG_UUID, role: 'viewer' }));

    await captureRedirect(() => switchOrg({ orgId: ORG_UUID }));

    expect(updateUserById).toHaveBeenCalledWith(USER_ID, {
      app_metadata: { org_id: ORG_UUID, role: 'viewer' },
    });
  });

  it('refreshes the session after the metadata write and before redirecting', async () => {
    // リフレッシュを挟まないと、直後の RSC が古い org_id の JWT を読んでしまい
    // 切替前テナントのデータが表示されうる。順序まで検証する。
    const { switchOrg } = await actions();

    await captureRedirect(() => switchOrg({ orgId: ORG_UUID }));

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
      auth.refreshSession.mock.invocationCallOrder[0],
    );
  });

  it('does not redirect when the admin metadata update fails', async () => {
    const { switchOrg } = await actions();
    updateUserById.mockResolvedValue({ data: null, error: { message: 'not allowed' } });

    expect(await switchOrg({ orgId: ORG_UUID })).toEqual(err('組織の切り替えに失敗しました'));
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
