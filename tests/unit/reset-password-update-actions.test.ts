import { beforeEach, describe, expect, it, vi } from 'vitest';

import { err, ok } from '@/lib/result';

/**
 * パスワード再設定の完了（`src/app/(auth)/reset-password/update/actions.ts`、F-14）。
 *
 * 未認証でも叩ける公開 POST エンドポイント。以下を検証する。
 *
 *   - Zod を通らない入力（8文字未満・確認不一致）が Supabase Auth に届かないこと
 *   - セッションが無ければ updateUser を呼ばないこと（画面側の判定は信用しない）
 *   - updateUser には検証済みのパスワードだけを渡すこと
 *   - Supabase の生のエラー文言を返さないこと（ADR 0019）
 */

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient }));

const NEW_PASSWORD = 'new-password-123';

function mockSupabase(user: { id: string } | null = { id: 'user-1' }) {
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
  };
  createClient.mockResolvedValue({ auth });
  return auth;
}

async function action() {
  return (await import('@/app/(auth)/reset-password/update/actions')).updatePassword;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updatePassword — 入力検証', () => {
  it('8文字未満は Supabase に届く前に拒否する', async () => {
    const auth = mockSupabase();
    const updatePassword = await action();

    expect(await updatePassword({ password: 'short12', confirmPassword: 'short12' })).toEqual(
      err('パスワードは8文字以上で入力してください'),
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('ちょうど8文字は通す', async () => {
    const auth = mockSupabase();
    const updatePassword = await action();

    expect(await updatePassword({ password: '12345678', confirmPassword: '12345678' })).toEqual(
      ok(undefined),
    );
    expect(auth.updateUser).toHaveBeenCalledWith({ password: '12345678' });
  });

  it('確認用と一致しなければ拒否する', async () => {
    const auth = mockSupabase();
    const updatePassword = await action();

    expect(
      await updatePassword({ password: NEW_PASSWORD, confirmPassword: 'new-password-124' }),
    ).toEqual(err('パスワードが一致しません'));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('確認用が空なら拒否する', async () => {
    const auth = mockSupabase();
    const updatePassword = await action();

    expect(await updatePassword({ password: NEW_PASSWORD, confirmPassword: '' })).toMatchObject({
      success: false,
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('updatePassword — セッションと更新', () => {
  it('セッションの本人のパスワードを更新する', async () => {
    const auth = mockSupabase();
    const updatePassword = await action();

    const result = await updatePassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(result).toEqual(ok(undefined));
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    // 渡すのはパスワードだけ。確認欄やメール等の他の属性は送らない。
    expect(auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
  });

  it('セッションが無ければ updateUser を呼ばずに失敗を返す', async () => {
    // リンクの期限切れ・別ブラウザで開いた場合。Server Action は画面を経ずに
    // 直接叩けるので、ここで止める。
    const auth = mockSupabase(null);
    const updatePassword = await action();

    const result = await updatePassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(result).toMatchObject({ success: false });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('Supabase のエラーは code で日本語に変換し、生の文言を返さない', async () => {
    const auth = mockSupabase();
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'same_password',
        message: 'New password should be different from the old password.',
      },
    });
    const updatePassword = await action();

    const result = await updatePassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(result).toEqual(err('現在と同じパスワードは設定できません'));
    expect(JSON.stringify(result)).not.toContain('New password');
  });
});
