'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        <Button variant="ghost" size="sm" render={<Link href="/settings/members" />}>
          メンバー
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>組織情報</CardTitle>
          <CardDescription>組織の基本情報を管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">組織名</Label>
              <Input id="org-name" disabled={isPending || !isAdmin} {...register('name')} />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>
            {isAdmin && (
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            )}
          </form>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">スラッグ</Label>
              <span className="text-sm">{org.slug}</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">プラン</Label>
              <Badge variant="secondary">{org.plan}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
