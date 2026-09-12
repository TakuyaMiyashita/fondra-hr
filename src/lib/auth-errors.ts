import type { AuthError } from '@supabase/supabase-js';

/**
 * Supabase Auth のエラーを画面に出す文言に変換する。
 *
 * **生の `error.message` をそのまま返さないこと。** 日本語の UI に英語が出る
 * というだけでなく、`Password should be at least 6 characters.` のように
 * **こちら側の検証より緩い内部の制約**が漏れる。UI は8文字以上を求めているのに
 * 6文字と表示されると、利用者は矛盾した案内を受ける。
 *
 * **`user_already_exists` は伏せない。** 伏せると「登録できませんでした」としか
 * 言えず、利用者は原因が分からないままになる。アカウントの存在が分かる
 * （列挙できる）ことは受け入れる判断で、[ADR 0019](../../docs/adr/0019-signup-tells-you-the-email-is-taken.md)
 * に理由を残している。
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません',
  user_already_exists: 'このメールアドレスは既に登録されています',
  email_exists: 'このメールアドレスは既に登録されています',
  weak_password: 'パスワードは8文字以上で入力してください',
  over_request_rate_limit: '試行回数が多すぎます。しばらく待ってからやり直してください',
  over_email_send_rate_limit:
    'メールの送信回数が上限に達しました。しばらく待ってからやり直してください',
  email_not_confirmed: 'メールアドレスの確認が完了していません',
  same_password: '現在と同じパスワードは設定できません',
  validation_failed: '入力内容が正しくありません',
};

/** 対応表に無いものはここに落とす。内部の文言を画面に出さないため。 */
const FALLBACK = '処理に失敗しました。しばらく待ってからやり直してください';

export function authErrorMessage(error: Pick<AuthError, 'code' | 'message'>): string {
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}
