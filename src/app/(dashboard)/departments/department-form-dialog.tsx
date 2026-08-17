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
import { createDepartmentSchema, type CreateDepartmentInput } from '@/lib/validations/department';
import type { Department } from '@/types/department';

import { createDepartmentAction, updateDepartmentAction } from './actions';

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: Department;
  defaultParentId?: string;
  departments: Department[];
  onSuccess: () => void;
}

function getDescendantIds(departments: Department[], rootId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    ids.add(current);
    for (const dept of departments) {
      if (dept.parentId === current && !ids.has(dept.id)) {
        queue.push(dept.id);
      }
    }
  }
  return ids;
}

export function DepartmentFormDialog({
  mode,
  open,
  onOpenChange,
  defaultValues,
  defaultParentId,
  departments,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const isEdit = mode === 'edit';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name,
          parentId: defaultValues.parentId ?? '',
        }
      : {
          name: '',
          parentId: defaultParentId ?? '',
        },
  });

  useEffect(() => {
    if (open) {
      reset(
        defaultValues
          ? { name: defaultValues.name, parentId: defaultValues.parentId ?? '' }
          : { name: '', parentId: defaultParentId ?? '' },
      );
    }
  }, [open, defaultValues, defaultParentId, reset]);

  const parentId = watch('parentId');

  const excludeIds =
    isEdit && defaultValues ? getDescendantIds(departments, defaultValues.id) : new Set<string>();

  const parentOptions = departments.filter((d) => !excludeIds.has(d.id));

  function onSubmit(data: CreateDepartmentInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateDepartmentAction({ id: defaultValues!.id, ...data })
        : await createDepartmentAction(data);

      if (result.success) {
        toast.success(isEdit ? '部署を更新しました' : '部署を作成しました');
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
          <DialogTitle>{isEdit ? '部署を編集' : '部署を作成'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '部署の情報を変更します' : '新しい部署を追加します'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name">部署名 *</Label>
            <Input id="dept-name" placeholder="営業部" disabled={isPending} {...register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>親部署</Label>
            <Select
              value={parentId || '__none__'}
              onValueChange={(val) => setValue('parentId', !val || val === '__none__' ? '' : val)}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="なし（トップレベル）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">なし（トップレベル）</SelectItem>
                {parentOptions.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.parentId && (
              <p className="text-destructive text-xs">{errors.parentId.message}</p>
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
