'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type UpdatePasswordInput, updatePasswordSchema } from '@/lib/validations/auth';

import { updatePassword } from './actions';

export function UpdatePasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  function onSubmit(data: UpdatePasswordInput) {
    startTransition(async () => {
      const result = await updatePassword(data);
      if (result.success) {
        toast.success('パスワードを変更しました');
        router.replace('/dashboard');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormField invalid={!!errors.password}>
        <FormLabel htmlFor="password">新しいパスワード</FormLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          {...register('password')}
        />
        <FormError>{errors.password?.message}</FormError>
      </FormField>

      <FormField invalid={!!errors.confirmPassword}>
        <FormLabel htmlFor="confirmPassword">新しいパスワード（確認）</FormLabel>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          {...register('confirmPassword')}
        />
        <FormError>{errors.confirmPassword?.message}</FormError>
      </FormField>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        パスワードを変更
      </Button>
    </form>
  );
}
