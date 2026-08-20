'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inviteMemberSchema, type InviteMemberInput } from '@/lib/validations/settings';

import { inviteMemberAction } from '../actions';

// Base UI の Select は items を渡さないと、選択中の値をラベルではなく
// 生の値（admin / member など）のまま表示する。
const ROLE_ITEMS: Record<string, string> = {
  admin: '管理者',
  member: 'メンバー',
  viewer: '閲覧者',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InviteDialog({ open, onOpenChange, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const selectedRole = useWatch({ control, name: 'role' });

  function onSubmit(data: InviteMemberInput) {
    startTransition(async () => {
      const result = await inviteMemberAction(data);
      if (result.success) {
        toast.success('招待を送信しました');
        reset();
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
          <DialogDescription>メールアドレスとロールを指定して招待します</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField invalid={!!errors.email}>
            <FormLabel htmlFor="invite-email">メールアドレス</FormLabel>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@example.com"
              disabled={isPending}
              {...register('email')}
            />
            <FormError>{errors.email?.message}</FormError>
          </FormField>
          <FormField invalid={!!errors.role}>
            <FormLabel>ロール</FormLabel>
            <Select
              items={ROLE_ITEMS}
              value={selectedRole}
              onValueChange={(val) => {
                if (val) setValue('role', val as InviteMemberInput['role']);
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormError>{errors.role?.message}</FormError>
          </FormField>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              招待する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
