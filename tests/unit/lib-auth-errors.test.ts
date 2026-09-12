import { describe, expect, it } from 'vitest';

import { authErrorMessage } from '@/lib/auth-errors';

/**
 * Supabase Auth のエラー文言の変換。
 *
 * **生の `error.message` を画面に出してはいけない。** 日本語 UI に英語が出る
 * だけでなく、`Password should be at least 6 characters.` のように
 * **こちらの検証より緩い内部の制約**が漏れる。UI は8文字以上を求めているので、
 * 利用者は矛盾した案内を受けることになる。
 */

const error = (code: string | undefined, message = 'raw english message') =>
  ({ code, message }) as never;

describe('authErrorMessage', () => {
  it.each([
    ['invalid_credentials', 'メールアドレスまたはパスワードが正しくありません'],
    ['user_already_exists', 'このメールアドレスは既に登録されています'],
    ['email_exists', 'このメールアドレスは既に登録されています'],
    ['over_request_rate_limit', '試行回数が多すぎます。しばらく待ってからやり直してください'],
  ])('%s を日本語に変換する', (code, expected) => {
    expect(authErrorMessage(error(code))).toBe(expected);
  });

  it('weak_password は UI 側の契約（8文字）で案内する', () => {
    // Supabase が返すのは「6 characters」。内部の数字を見せる理由は無い。
    expect(authErrorMessage(error('weak_password'))).toContain('8文字以上');
  });

  it.each([
    ['未知の code', error('some_new_code_from_upstream')],
    ['code が無い', error(undefined)],
  ])('%s は汎用の文言に落とす', (_label, input) => {
    expect(authErrorMessage(input)).toBe(
      '処理に失敗しました。しばらく待ってからやり直してください',
    );
  });

  it('どの入力でも生のメッセージを返さない', () => {
    // ここが漏れると内部の制約や実装の都合が画面に出る。
    const raw = 'Password should be at least 6 characters.';

    for (const code of ['invalid_credentials', 'weak_password', 'unknown_code', undefined]) {
      expect(authErrorMessage(error(code, raw))).not.toContain(raw);
      expect(authErrorMessage(error(code, raw))).not.toMatch(/[A-Za-z]{4,}/);
    }
  });
});
