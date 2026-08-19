import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';

/**
 * 招待受諾 + サインアップの Server Action。
 *
 * 未認証のユーザーが「他社テナントのメンバーシップ」を獲得する唯一の経路であり、
 * テナント分離の最も外側の境界。以下を全経路検証する。
 *
 *   1. Zod 検証失敗 → err / Supabase Auth にも DB にも一切到達しない
 *   2. Supabase signUp 失敗 → err、招待は消費されない
 *   3. signUp 成功だが user が null → err、招待は消費されない
 *   4. acceptInvitation 失敗 → err、redirect しない
 *   5. 正常系 → acceptInvitation に「今作成した Auth ユーザーの id」が渡り、redirect する
 *
 * 2〜4 で招待が消費されない（acceptInvitation が呼ばれない / redirect しない）ことが重要。
 * 途中で消費されると、ユーザーは加入できないのに招待だけ使用済みになり、
 * 管理者が再発行するまで復旧できないデッドロックになる。
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
vi.mock('@/services/auth', () => ({ acceptInvitation: vi.fn(), getInvitationByToken: vi.fn() }));

async function svc() {
  return vi.mocked(await import('@/services/auth'));
}

async function actions() {
  return import('@/app/(auth)/invite/[token]/actions');
}

function mockSupabase() {
  const auth = {
    signUp: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-new' }, session: { access_token: 'stale' } },
      error: null,
    }),
    refreshSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  createClient.mockResolvedValue({ auth });
  return auth;
}

async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
  throw new Error('expected a redirect but the action returned normally');
}

const INVITATION_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';

const VALID = {
  invitationId: INVITATION_ID,
  orgId: ORG_ID,
  role: 'member',
  email: 'invitee@example.com',
  password: 'password123',
  token: TOKEN,
};

/** getInvitationByToken が返す招待レコード（サーバ側の唯一の真実）。 */
const INVITATION_ROW = {
  id: INVITATION_ID,
  orgId: ORG_ID,
  email: 'invitee@example.com',
  role: 'member' as const,
  expiresAt: new Date(Date.now() + 86_400_000),
  acceptedAt: null,
  orgName: 'Acme',
};

let auth: ReturnType<typeof mockSupabase>;

beforeEach(async () => {
  vi.clearAllMocks();
  redirect.mockImplementation((to: string) => {
    throw new RedirectError(to);
  });
  auth = mockSupabase();
  const s = await svc();
  s.getInvitationByToken.mockResolvedValue({ ...INVITATION_ROW });
});

/**
 * リダイレクトループの回帰テスト。
 *
 * signUp() が返すセッションはメンバーシップ登録より前に発行されており、
 * JWT の app_metadata.org_id が null のままになる。このトークンで画面に入ると
 * getAuthContext() が /login へ飛ばし、ミドルウェアが認証済みとみなして
 * 戻すため、無限リダイレクトになる（検証環境で実際に発生）。
 *
 * 招待経路も自己サインアップと同じ構造なので同じ防御が要る。
 */
describe('acceptInviteAndSignUp — セッションの claim', () => {
  it('refreshes the session only after the membership exists', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    await captureRedirect(() => acceptInviteAndSignUp(VALID));

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(s.acceptInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      auth.refreshSession.mock.invocationCallOrder[0],
    );
  });

  it('does not refresh when accepting the invitation fails', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(err('招待の承認に失敗しました'));

    await acceptInviteAndSignUp(VALID);

    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends the user to login without refreshing when email confirmation is required', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'user-new' }, session: null },
      error: null,
    });
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    const to = await captureRedirect(() => acceptInviteAndSignUp(VALID));

    expect(to).toBe('/login?registered=true');
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('acceptInviteAndSignUp — input validation', () => {
  it('rejects a malformed invitation id without creating an auth user', async () => {
    // 検証前に signUp してしまうと、加入できない孤児アカウントが増えていく。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();

    expect((await acceptInviteAndSignUp({ ...VALID, invitationId: 'nope' })).success).toBe(false);
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(s.acceptInvitation).not.toHaveBeenCalled();
  });

  it('rejects a malformed organization id', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();

    expect((await acceptInviteAndSignUp({ ...VALID, orgId: 'nope' })).success).toBe(false);
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(s.acceptInvitation).not.toHaveBeenCalled();
  });

  it('rejects a malformed invitation token', async () => {
    // token は UUID 形式であることだけが検証される。形式違反はここで止まる。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();

    expect((await acceptInviteAndSignUp({ ...VALID, token: 'not-a-token' })).success).toBe(false);
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(s.acceptInvitation).not.toHaveBeenCalled();
  });

  it('rejects a role outside the known set', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();

    expect((await acceptInviteAndSignUp({ ...VALID, role: 'superuser' })).success).toBe(false);
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(s.acceptInvitation).not.toHaveBeenCalled();
  });

  it('rejects an invalid email address', async () => {
    const { acceptInviteAndSignUp } = await actions();

    expect((await acceptInviteAndSignUp({ ...VALID, email: 'nope' })).success).toBe(false);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters with a Japanese message', async () => {
    const { acceptInviteAndSignUp } = await actions();

    expect(await acceptInviteAndSignUp({ ...VALID, password: 'short' })).toEqual(
      err('パスワードは8文字以上で入力してください'),
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe('acceptInviteAndSignUp — Supabase Auth failures', () => {
  it('returns the Supabase error and leaves the invitation unconsumed', async () => {
    // 既に登録済みのメールで受諾された場合など。招待を消費してはならない。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    expect(await acceptInviteAndSignUp(VALID)).toEqual(err('User already registered'));
    expect(s.acceptInvitation).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('reports a Japanese error when signUp succeeds but returns no user', async () => {
    // user が null のまま進むと、undefined の userId でメンバーシップが作られる。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    auth.signUp.mockResolvedValue({ data: { user: null }, error: null });

    expect(await acceptInviteAndSignUp(VALID)).toEqual(err('ユーザーの作成に失敗しました'));
    expect(s.acceptInvitation).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('propagates an unexpected Supabase client failure instead of swallowing it', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    auth.signUp.mockRejectedValue(new Error('network down'));

    await expect(acceptInviteAndSignUp(VALID)).rejects.toThrow('network down');
    expect(s.acceptInvitation).not.toHaveBeenCalled();
  });
});

describe('acceptInviteAndSignUp — invitation acceptance', () => {
  it('does not redirect when the membership cannot be created', async () => {
    // 加入していないのに /login へ飛ばすと、ユーザーは
    // 「登録できた」と思ってログインし、テナント未所属で行き止まりになる。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(err('招待の承認に失敗しました: duplicate key'));

    expect(await acceptInviteAndSignUp(VALID)).toEqual(
      err('招待の承認に失敗しました: duplicate key'),
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it('binds the membership to the newly created auth user and redirects', async () => {
    // メンバーシップの userId が「今作成した Auth ユーザー」であることが最重要。
    // ここが他人の id になると、招待経由で他人のアカウントに権限が付与される。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    const to = await captureRedirect(() => acceptInviteAndSignUp(VALID));

    expect(s.acceptInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      'user-new',
      ORG_ID,
      'member',
      'invitee@example.com',
    );
    expect(to).toBe('/dashboard');
  });

  it('signs the user up with the invited address and the submitted password', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    await captureRedirect(() => acceptInviteAndSignUp(VALID));

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'invitee@example.com',
      password: 'password123',
    });
  });
});

/**
 * ここがこのアクションのセキュリティ境界。
 *
 * このアクションは未認証で叩ける公開 POST エンドポイントであり、
 * フォームが送る invitationId / orgId / role / email は攻撃者が自由に差し替えられる。
 * 信用してよいのは token だけで、他は必ずサーバ側で引き直した招待レコードから導出する。
 *
 * 以前はクライアント値をそのまま acceptInvitation へ渡していたため、
 * 自組織の orgId を知る既存メンバーが role:'owner' を指定するだけで
 * オーナー権限のアカウントを自己発行できた（テナント分離の破綻）。
 */
describe('acceptInviteAndSignUp — トークン検証（権限昇格の防止）', () => {
  it('rejects a token that resolves to no invitation', async () => {
    // 無効・期限切れ・使用済みはすべて getInvitationByToken が null を返すことで表現される。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.getInvitationByToken.mockResolvedValue(null);

    expect(await acceptInviteAndSignUp(VALID)).toEqual(err('この招待リンクは無効か、期限切れです'));
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(s.acceptInvitation).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('looks the invitation up by the submitted token', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    await captureRedirect(() => acceptInviteAndSignUp(VALID));

    expect(s.getInvitationByToken).toHaveBeenCalledWith(TOKEN);
  });

  it('ignores a client-supplied role and uses the invited role', async () => {
    // 権限昇格の本丸。owner を送っても招待レコードの member が使われること。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    await captureRedirect(() => acceptInviteAndSignUp({ ...VALID, role: 'owner' }));

    expect(s.acceptInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      'user-new',
      ORG_ID,
      'member',
      'invitee@example.com',
    );
  });

  it('ignores a client-supplied organization id', async () => {
    // 他テナントの orgId を送っても、招待レコードの組織にしか加入できないこと。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    const foreignOrg = '99999999-9999-4999-8999-999999999999';
    await captureRedirect(() => acceptInviteAndSignUp({ ...VALID, orgId: foreignOrg }));

    expect(s.acceptInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      'user-new',
      ORG_ID,
      'member',
      'invitee@example.com',
    );
    expect(s.acceptInvitation.mock.calls[0]).not.toContain(foreignOrg);
  });

  it('ignores a client-supplied invitation id', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    const foreignInvitation = '88888888-8888-4888-8888-888888888888';
    await captureRedirect(() =>
      acceptInviteAndSignUp({ ...VALID, invitationId: foreignInvitation }),
    );

    expect(s.acceptInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      'user-new',
      ORG_ID,
      'member',
      'invitee@example.com',
    );
  });

  it('ignores a client-supplied email and signs up as the invited address', async () => {
    // ここを許すと、有効なトークンを入手した第三者が別アドレスで組織に参加できる。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    await captureRedirect(() => acceptInviteAndSignUp({ ...VALID, email: 'attacker@example.com' }));

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'invitee@example.com',
      password: 'password123',
    });
  });

  it('honours the invited role when the invitation itself grants owner', async () => {
    // 招待レコードが owner の場合は当然 owner で加入する。
    // 「常に member に落とす」実装になっていないことの確認。
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.getInvitationByToken.mockResolvedValue({ ...INVITATION_ROW, role: 'owner' });
    s.acceptInvitation.mockResolvedValue(ok(undefined));

    await captureRedirect(() => acceptInviteAndSignUp(VALID));

    expect(s.acceptInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      'user-new',
      ORG_ID,
      'owner',
      'invitee@example.com',
    );
  });

  it('propagates an unexpected lookup failure instead of swallowing it', async () => {
    const { acceptInviteAndSignUp } = await actions();
    const s = await svc();
    s.getInvitationByToken.mockRejectedValue(new Error('connection terminated'));

    await expect(acceptInviteAndSignUp(VALID)).rejects.toThrow('connection terminated');
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
