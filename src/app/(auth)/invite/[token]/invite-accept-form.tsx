'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { acceptInviteAndSignUp } from './actions';

const passwordSchema = z.object({
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
});

type PasswordInput = z.infer<typeof passwordSchema>;

interface InviteAcceptFormProps {
  invitationId: string;
  orgId: string;
  orgName: string;
  role: string;
  email: string;
  token: string;
}

export function InviteAcceptForm({
  invitationId,
  orgId,
  orgName,
  role,
  email,
  token,
}: InviteAcceptFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
  });

  function onSubmit(data: PasswordInput) {
    startTransition(async () => {
      const result = await acceptInviteAndSignUp({
        invitationId,
        orgId,
        role,
        email,
        password: data.password,
        token,
      });
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-md bg-muted p-3 text-sm">
        <p>
          <strong>{orgName}</strong> に <strong>{role}</strong> として参加します
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" value={email} disabled />
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
        アカウントを作成して参加
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
