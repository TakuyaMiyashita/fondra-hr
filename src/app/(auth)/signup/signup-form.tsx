'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type SignUpInput, signUpSchema } from '@/lib/validations/auth';

import { signUp } from '../actions';

export function SignupForm() {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  function onSubmit(data: SignUpInput) {
    startTransition(async () => {
      const result = await signUp(data);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="orgName">組織名</Label>
        <Input
          id="orgName"
          placeholder="株式会社○○"
          disabled={isPending}
          {...register('orgName')}
        />
        {errors.orgName && (
          <p className="text-xs text-destructive">{errors.orgName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          disabled={isPending}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">パスワード</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">8文字以上で入力してください</p>
        )}
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
