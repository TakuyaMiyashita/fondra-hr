'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type SignInInput, signInSchema } from '@/lib/validations/auth';

import { signIn } from '../actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  function onSubmit(data: SignInInput) {
    startTransition(async () => {
      const result = await signIn(data);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {registered && (
        <p className="bg-primary/10 text-primary rounded-md p-3 text-center text-sm">
          アカウントを作成しました。メールを確認してからログインしてください。
        </p>
      )}

      <FormField invalid={!!errors.email}>
        <FormLabel htmlFor="email">メールアドレス</FormLabel>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          disabled={isPending}
          {...register('email')}
        />
        <FormError>{errors.email?.message}</FormError>
      </FormField>

      <FormField invalid={!!errors.password}>
        <div className="flex items-center justify-between">
          <FormLabel htmlFor="password">パスワード</FormLabel>
          <Link
            href="/reset-password"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            パスワードを忘れた方
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          disabled={isPending}
          {...register('password')}
        />
        <FormError>{errors.password?.message}</FormError>
      </FormField>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        ログイン
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="text-foreground font-medium hover:underline">
          サインアップ
        </Link>
      </p>
    </form>
  );
}
