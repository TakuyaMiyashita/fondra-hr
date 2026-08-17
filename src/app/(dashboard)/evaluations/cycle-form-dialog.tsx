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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createCycleSchema,
  type CreateCycleInput,
  type CycleStatus,
} from '@/lib/validations/evaluation';
import type { EvaluationCycle } from '@/types/evaluation';

import { createCycleAction, updateCycleAction } from './actions';

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: EvaluationCycle;
  onSuccess: () => void;
}

export function CycleFormDialog({ mode, open, onOpenChange, defaultValues, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const isEdit = mode === 'edit';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCycleInput & { status?: CycleStatus }>({
    resolver: zodResolver(createCycleSchema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name,
          periodStart: defaultValues.periodStart,
          periodEnd: defaultValues.periodEnd,
          status: defaultValues.status,
        }
      : {
          name: '',
          periodStart: '',
          periodEnd: '',
        },
  });

  useEffect(() => {
    if (open) {
      reset(
        defaultValues
          ? {
              name: defaultValues.name,
              periodStart: defaultValues.periodStart,
              periodEnd: defaultValues.periodEnd,
              status: defaultValues.status,
            }
          : {
              name: '',
              periodStart: '',
              periodEnd: '',
            },
      );
    }
  }, [open, defaultValues, reset]);

  const status = watch('status');

  function onSubmit(data: CreateCycleInput & { status?: CycleStatus }) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCycleAction({
            id: defaultValues!.id,
            name: data.name,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            status: data.status ?? defaultValues!.status,
          })
        : await createCycleAction(data);

      if (result.success) {
        toast.success(isEdit ? '評価サイクルを更新しました' : '評価サイクルを作成しました');
        reset();
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '評価サイクルを編集' : '評価サイクルを作成'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '評価サイクルの情報を変更します' : '新しい評価サイクルを作成します'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cycle-name">サイクル名 *</Label>
            <Input
              id="cycle-name"
              placeholder="例: 2026年上期評価"
              disabled={isPending}
              {...register('name')}
            />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cycle-start">開始日 *</Label>
              <Input
                id="cycle-start"
                type="date"
                disabled={isPending}
                {...register('periodStart')}
              />
              {errors.periodStart && (
                <p className="text-destructive text-xs">{errors.periodStart.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-end">終了日 *</Label>
              <Input id="cycle-end" type="date" disabled={isPending} {...register('periodEnd')} />
              {errors.periodEnd && (
                <p className="text-destructive text-xs">{errors.periodEnd.message}</p>
              )}
            </div>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select
                value={status || defaultValues?.status || 'draft'}
                onValueChange={(val) => {
                  if (val) setValue('status', val as CycleStatus);
                }}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">下書き</SelectItem>
                  <SelectItem value="in_progress">進行中</SelectItem>
                  <SelectItem value="completed">完了</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

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
