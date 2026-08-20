'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { ButtonLink } from '@/components/shared/button-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { updateOrgSchema, type UpdateOrgInput } from '@/lib/validations/settings';
import type { Role } from '@/services/auth-context';
import type { OrgInfo } from '@/types/settings';

import { updateOrgAction } from './actions';

interface Props {
  org: OrgInfo;
  role: Role;
}

export function SettingsGeneralClient({ org, role }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isAdmin = role === 'owner' || role === 'admin';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateOrgInput>({
    resolver: zodResolver(updateOrgSchema),
    defaultValues: { name: org.name },
  });

  function onSubmit(data: UpdateOrgInput) {
    startTransition(async () => {
      const result = await updateOrgAction(data);
      if (result.success) {
        toast.success('組織名を更新しました');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">設定</h1>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button variant="ghost" size="sm" className="font-semibold">
          一般
        </Button>
        <ButtonLink variant="ghost" size="sm" href="/settings/members">
          メンバー
        </ButtonLink>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>組織情報</CardTitle>
          <CardDescription>組織の基本情報を管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField invalid={!!errors.name}>
              <FormLabel htmlFor="org-name">組織名</FormLabel>
              <Input id="org-name" disabled={isPending || !isAdmin} {...register('name')} />
              <FormError>{errors.name?.message}</FormError>
            </FormField>
            {isAdmin && (
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            )}
          </form>

          {/* 入力ではなく「名前と値」の組。<Label> は入力に紐づくものなので使わない */}
          <dl className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground text-sm leading-none font-medium">スラッグ</dt>
              <dd className="text-sm">{org.slug}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground text-sm leading-none font-medium">プラン</dt>
              <dd>
                <Badge variant="secondary">{org.plan}</Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
