import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'パスワードリセット',
};

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">パスワードリセット</CardTitle>
        <CardDescription>
          登録済みのメールアドレスを入力してください。パスワードリセット用のリンクを送信します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
