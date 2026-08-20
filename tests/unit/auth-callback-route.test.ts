import { beforeEach, describe, expect, it, vi } from 'vitest';

import { err, ok } from '@/lib/result';

/**
 * メール確認 / パスワード再設定リンクの受け口（GET /auth/callback）。
 *
 * ロジック本体（completePendingSignUp）は Service Layer 側でテスト済みなので、
 * ここで見るのは「配線」そのもの。この経路が壊れるとメール確認を終えた
 * ユーザーがアプリに入れなくなるため、以下を重点的に検証する。
 *
 *   - 認証コードを検証できない入力で、必ずログイン画面へ戻すこと
 *     （失敗しているのにアプリ内へ遷移させない）
 *   - Service から受け取ったエラーを URL エンコードして渡すこと
 *   - created が true のときだけ user_metadata を消化し、セッションを
 *     リフレッシュすること
 *   - refreshSession が completePendingSignUp より「後」に呼ばれること。
 *     逆順だとメンバーシップ作成前の JWT（app_metadata.org_id が null）が
 *     残り、リダイレクトループになる
 */

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/services/auth', () => ({
  completePendingSignUp: vi.fn(),
  // 実装が user_metadata のキーとして参照する。signUp が預けたキーと
  // ここで消化するキーが一致していることがこの機能の前提なので実値にする。
  PENDING_ORG_NAME_KEY: 'pending_org_name',
  PENDING_INVITATION_TOKEN_KEY: 'pending_invitation_token',
}));

async function svc() {
  return vi.mocked(await import('@/services/auth'));
}

async function route() {
  return import('@/app/auth/callback/route');
}

const ORIGIN = 'https://app.example.test';
const USER = {
  id: 'user-1',
  email: 'confirmed@example.test',
  user_metadata: { pending_org_name: 'Fondra' },
};

/** 呼び出し順序を記録するための共有バッファ。 */
let calls: string[] = [];

type ExchangeResult = { data: { user: unknown }; error: unknown };

/** Supabase Auth クライアントの最小モック。実装が使うメソッドだけを持つ。 */
function mockSupabase(exchangeResult: ExchangeResult = { data: { user: USER }, error: null }) {
  const auth = {
    exchangeCodeForSession: vi.fn(async () => {
      calls.push('exchangeCodeForSession');
      return exchangeResult;
    }),
    updateUser: vi.fn(async () => {
      calls.push('updateUser');
      return { data: {}, error: null };
    }),
    refreshSession: vi.fn(async () => {
      calls.push('refreshSession');
      return { data: {}, error: null };
    }),
  };
  createClient.mockResolvedValue({ auth });
  return auth;
}

function request(query = '?code=auth-code') {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

/** リダイレクト先（Location ヘッダ）を取り出す。 */
async function locationOf(query?: string) {
  const { GET } = await route();
  const res = await GET(request(query));
  return { status: res.status, location: res.headers.get('location') };
}

beforeEach(async () => {
  vi.clearAllMocks();
  calls = [];
  (await svc()).completePendingSignUp.mockImplementation(async () => {
    calls.push('completePendingSignUp');
    return ok({ created: false });
  });
});

describe('GET /auth/callback', () => {
  describe('認証コードの検証', () => {
    it('code が無ければ Supabase を呼ばずにログイン画面へ戻す', async () => {
      const auth = mockSupabase();

      expect(await locationOf('')).toEqual({
        status: 307,
        location: `${ORIGIN}/login?error=auth`,
      });
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect((await svc()).completePendingSignUp).not.toHaveBeenCalled();
    });

    it('code をそのまま exchangeCodeForSession に渡す', async () => {
      const auth = mockSupabase();

      await locationOf('?code=abc123');

      expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    });

    it('exchangeCodeForSession がエラーを返したらログイン画面へ戻す', async () => {
      mockSupabase({ data: { user: null }, error: { message: 'invalid code' } });

      expect(await locationOf()).toEqual({
        status: 307,
        location: `${ORIGIN}/login?error=auth`,
      });
      expect((await svc()).completePendingSignUp).not.toHaveBeenCalled();
    });

    it('エラーが無くても user が取れなければログイン画面へ戻す', async () => {
      // error だけを見ていると、user が無いまま後続の処理に進んでしまう。
      mockSupabase({ data: { user: null }, error: null });

      expect(await locationOf()).toEqual({
        status: 307,
        location: `${ORIGIN}/login?error=auth`,
      });
      expect((await svc()).completePendingSignUp).not.toHaveBeenCalled();
    });
  });

  describe('保留していたサインアップの消化', () => {
    it('確認済みユーザーの id / email / user_metadata を Service に渡す', async () => {
      mockSupabase();

      await locationOf();

      expect((await svc()).completePendingSignUp).toHaveBeenCalledWith(
        USER.id,
        USER.email,
        USER.user_metadata,
      );
    });

    it('Service が失敗したらエラーメッセージ付きでログイン画面へ戻す', async () => {
      mockSupabase();
      (await svc()).completePendingSignUp.mockResolvedValue(
        err('この招待リンクは無効か、期限切れです'),
      );

      expect(await locationOf()).toEqual({
        status: 307,
        location: `${ORIGIN}/login?error=${encodeURIComponent('この招待リンクは無効か、期限切れです')}`,
      });
    });

    it('エラーメッセージを URL エンコードする（& や空白でクエリが壊れない）', async () => {
      mockSupabase();
      (await svc()).completePendingSignUp.mockResolvedValue(err('組織の作成に失敗しました: a & b'));

      const { location } = await locationOf();

      expect(location).toContain('%26');
      expect(new URL(location!).searchParams.get('error')).toBe('組織の作成に失敗しました: a & b');
    });

    it('Service が失敗したら metadata の消化もリフレッシュもしない', async () => {
      const auth = mockSupabase();
      (await svc()).completePendingSignUp.mockResolvedValue(err('失敗'));

      await locationOf();

      expect(auth.updateUser).not.toHaveBeenCalled();
      expect(auth.refreshSession).not.toHaveBeenCalled();
    });
  });

  describe('created が true のとき', () => {
    beforeEach(async () => {
      (await svc()).completePendingSignUp.mockImplementation(async () => {
        calls.push('completePendingSignUp');
        return ok({ created: true });
      });
    });

    it('預けた組織名・招待トークンを両方 null で消す', async () => {
      const auth = mockSupabase();

      await locationOf();

      expect(auth.updateUser).toHaveBeenCalledWith({
        data: { pending_org_name: null, pending_invitation_token: null },
      });
    });

    it('セッションをリフレッシュする', async () => {
      const auth = mockSupabase();

      await locationOf();

      expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    });

    it('refreshSession は completePendingSignUp より後に呼ばれる', async () => {
      // 逆順だとメンバーシップ作成前の JWT のままアプリに入り、
      // ミドルウェアが未所属と判定してリダイレクトループになる。
      mockSupabase();

      await locationOf();

      expect(calls).toEqual([
        'exchangeCodeForSession',
        'completePendingSignUp',
        'updateUser',
        'refreshSession',
      ]);
    });

    it('消化が済んだら遷移先へリダイレクトする', async () => {
      mockSupabase();

      expect(await locationOf()).toEqual({ status: 307, location: `${ORIGIN}/employees` });
    });
  });

  describe('created が false のとき', () => {
    it('metadata の消化もセッションのリフレッシュもしない', async () => {
      // パスワード再設定など、消化するものが無い経路でも同じコールバックを通る。
      // ここで updateUser / refreshSession を呼ぶと余計な副作用になる。
      const auth = mockSupabase();

      await locationOf();

      expect(auth.updateUser).not.toHaveBeenCalled();
      expect(auth.refreshSession).not.toHaveBeenCalled();
      expect(calls).toEqual(['exchangeCodeForSession', 'completePendingSignUp']);
    });
  });

  describe('遷移先', () => {
    it('next が無ければ /employees へ', async () => {
      mockSupabase();

      expect(await locationOf('?code=abc')).toEqual({
        status: 307,
        location: `${ORIGIN}/employees`,
      });
    });

    it('next が指定されていればそこへ', async () => {
      mockSupabase();

      expect(await locationOf('?code=abc&next=/settings')).toEqual({
        status: 307,
        location: `${ORIGIN}/settings`,
      });
    });

    it('リダイレクト先は常にリクエスト元のオリジンを使う', async () => {
      mockSupabase();
      const { GET } = await route();

      const res = await GET(new Request('https://other.example.test/auth/callback?code=abc'));

      expect(res.headers.get('location')).toBe('https://other.example.test/employees');
    });
  });
});
