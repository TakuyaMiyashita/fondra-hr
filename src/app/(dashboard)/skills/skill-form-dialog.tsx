'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSkillSchema, type CreateSkillInput } from '@/lib/validations/skill';
import type { SkillWithCount } from '@/types/skill';

import { createSkillAction, updateSkillAction } from './actions';

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: SkillWithCount;
  onSuccess: () => void;
}

export function SkillFormDialog({ mode, open, onOpenChange, defaultValues, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const isEdit = mode === 'edit';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSkillInput>({
    resolver: zodResolver(createSkillSchema),
    defaultValues: defaultValues
      ? { name: defaultValues.name, category: defaultValues.category ?? '' }
      : { name: '', category: '' },
  });

  useEffect(() => {
    if (open) {
      reset(
        defaultValues
          ? { name: defaultValues.name, category: defaultValues.category ?? '' }
          : { name: '', category: '' },
      );
    }
  }, [open, defaultValues, reset]);

  function onSubmit(data: CreateSkillInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateSkillAction({ id: defaultValues!.id, ...data })
        : await createSkillAction(data);

      if (result.success) {
        toast.success(isEdit ? 'スキルを更新しました' : 'スキルを作成しました');
        reset();
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'スキルを編集' : 'スキルを追加'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'スキルの情報を変更します' : '新しいスキルを登録します'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name">スキル名 *</Label>
            <Input id="skill-name" placeholder="React" disabled={isPending} {...register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-category">カテゴリ</Label>
            <Input
              id="skill-category"
              placeholder="フロントエンド"
              disabled={isPending}
              {...register('category')}
            />
            {errors.category && (
              <p className="text-destructive text-xs">{errors.category.message}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              キャンセル
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '更新' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
