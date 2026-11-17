'use server';

import { authErrorMessage } from '@/lib/auth-errors';
import { type Result, err, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';
import { updatePasswordSchema } from '@/lib/validations/auth';

/**
 * セッションが無いときの文言。リンクの期限切れ・別ブラウザで開いた場合が該当する。
 * （'use server' のファイルは async 関数しか export できないため非公開）
 */
const NO_SESSION_MESSAGE =
  '再設定リンクの有効期限が切れているか、無効です。もう一度リセットメールを送信してください';

/**
 * 再設定リンクから来た利用者の新しいパスワードを設定する（F-14）。
 *
 * 再設定メールのリンクは /auth/callback でコードをセッションに交換し、
 * この画面（/reset-password/update）へ戻ってくる。ここで扱うのは
 * 「そのセッションの本人のパスワード」だけで、誰のパスワードかを入力では受け取らない。
 *
 * **セッションの有無はサーバーで確かめる。** 画面側の判定は表示のためだけで、
 * Server Action は単独で叩けるため信用しない。
 */
export async function updatePassword(data: {
  password: string;
  confirmPassword: string;
}): Promise<Result<void>> {
  const parsed = updatePasswordSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err(NO_SESSION_MESSAGE);
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    // 生の文言には Supabase 側の内部制約が含まれうる（ADR 0019）。
    return err(authErrorMessage(error));
  }

  return ok(undefined);
}
