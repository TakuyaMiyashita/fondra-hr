'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type ResetPasswordInput, resetPasswordSchema } from '@/lib/validations/auth';

import { resetPassword } from '../actions';

export function ResetPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  function onSubmit(data: ResetPasswordInput) {
    startTransition(async () => {
      const result = await resetPassword(data);
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
        <p className="text-muted-foreground text-sm">
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        リセットメールを送信
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        <Link href="/login" className="text-foreground font-medium hover:underline">
          ログインに戻る
        </Link>
      </p>
    </form>
  );
}
