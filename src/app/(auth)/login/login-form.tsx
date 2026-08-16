'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { signIn } from '../actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered');

  async function handleSubmit(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    startTransition(async () => {
      const result = await signIn(email, password);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {registered && (
        <p className="rounded-md bg-primary/10 p-3 text-center text-sm text-primary">
          アカウントを作成しました。メールを確認してからログインしてください。
        </p>
      )}

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">パスワード</Label>
          <Link
            href="/reset-password"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            パスワードを忘れた方
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        ログイン
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="font-medium text-foreground hover:underline">
          サインアップ
        </Link>
      </p>
    </form>
  );
}
