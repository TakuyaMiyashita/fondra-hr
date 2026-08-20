'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormDescription, FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      <FormField invalid={!!errors.orgName}>
        <FormLabel htmlFor="orgName">組織名</FormLabel>
        <Input
          id="orgName"
          placeholder="株式会社○○"
          disabled={isPending}
          {...register('orgName')}
        />
        <FormError>{errors.orgName?.message}</FormError>
      </FormField>

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
        <FormLabel htmlFor="password">パスワード</FormLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          {...register('password')}
        />
        {errors.password ? (
          <FormError>{errors.password.message}</FormError>
        ) : (
          <FormDescription>8文字以上で入力してください</FormDescription>
        )}
      </FormField>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        アカウントを作成
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        既にアカウントをお持ちの方は{' '}
        <Link href="/login" className="text-foreground font-medium hover:underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}
