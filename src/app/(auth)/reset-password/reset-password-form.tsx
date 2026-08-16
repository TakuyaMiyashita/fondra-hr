'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { resetPassword } from '../actions';

export function ResetPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  async function handleSubmit(formData: FormData) {
    const email = formData.get('email') as string;

    startTransition(async () => {
      const result = await resetPassword(email);
      if (result.success) {
        setSent(true);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          パスワードリセット用のメールを送信しました。メールに記載されたリンクからパスワードを再設定してください。
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full">
            ログインに戻る
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        リセットメールを送信
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          ログインに戻る
        </Link>
      </p>
    </form>
  );
}
