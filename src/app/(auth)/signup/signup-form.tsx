'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { signUp } from '../actions';

export function SignupForm() {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const orgName = formData.get('orgName') as string;

    startTransition(async () => {
      const result = await signUp(email, password, orgName);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="orgName">組織名</Label>
        <Input
          id="orgName"
          name="orgName"
          placeholder="株式会社○○"
          required
          disabled={isPending}
        />
      </div>

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
        <Label htmlFor="password">パスワード</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">8文字以上で入力してください</p>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        アカウントを作成
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        既にアカウントをお持ちの方は{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}
