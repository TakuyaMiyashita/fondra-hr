import type { Metadata } from 'next';

import { ButtonLink } from '@/components/shared/button-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

import { UpdatePasswordForm } from './update-password-form';

export const metadata: Metadata = {
  title: '新しいパスワードの設定',
};

/**
 * パスワード再設定の完了画面（F-14）。
 *
 * 再設定メールのリンク → /auth/callback（コードをセッションに交換）→ ここ。
 * セッションがある場合だけ入力欄を出す。無い場合（リンクの期限切れ・
 * 別ブラウザで開いた等）は再送の導線を出す。実際の判定は Server Action
 * （./actions.ts）でもう一度行う。
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle role="heading" aria-level={1} className="text-2xl font-bold tracking-tight">
          新しいパスワードの設定
        </CardTitle>
        <CardDescription>
          {user
            ? '新しいパスワードを入力してください。'
            : '再設定リンクの有効期限が切れているか、無効です。'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user ? (
          <UpdatePasswordForm />
        ) : (
          <ButtonLink href="/reset-password" variant="outline" className="w-full">
            リセットメールを再送する
          </ButtonLink>
        )}
      </CardContent>
    </Card>
  );
}
