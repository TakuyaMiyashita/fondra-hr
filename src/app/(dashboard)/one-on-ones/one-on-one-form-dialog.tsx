'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { createOneOnOneSchema, type CreateOneOnOneInput } from '@/lib/validations/one-on-one';
import type { OneOnOne } from '@/types/one-on-one';

import { createOneOnOneAction, updateOneOnOneAction } from './actions';

interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
}

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: OneOnOne;
  employees: EmployeeOption[];
  onSuccess: () => void;
}

export function OneOnOneFormDialog({
  mode,
  open,
  onOpenChange,
  defaultValues,
  employees,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const isEdit = mode === 'edit';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateOneOnOneInput>({
    resolver: zodResolver(createOneOnOneSchema),
    defaultValues: defaultValues
      ? {
          employeeId: defaultValues.employeeId,
          interviewerId: defaultValues.interviewerId,
          heldOn: defaultValues.heldOn,
          notes: defaultValues.notes ?? '',
          moodScore: defaultValues.moodScore ?? 0,
        }
      : {
          employeeId: '',
          interviewerId: '',
          heldOn: new Date().toISOString().slice(0, 10),
          notes: '',
          moodScore: 0,
        },
  });

  useEffect(() => {
    if (open) {
      reset(
        defaultValues
          ? {
              employeeId: defaultValues.employeeId,
              interviewerId: defaultValues.interviewerId,
              heldOn: defaultValues.heldOn,
              notes: defaultValues.notes ?? '',
              moodScore: defaultValues.moodScore ?? 0,
            }
          : {
              employeeId: '',
              interviewerId: '',
              heldOn: new Date().toISOString().slice(0, 10),
              notes: '',
              moodScore: 0,
            },
      );
    }
  }, [open, defaultValues, reset]);

  const employeeId = useWatch({ control, name: 'employeeId' });
  const interviewerId = useWatch({ control, name: 'interviewerId' });
  const moodScore = useWatch({ control, name: 'moodScore' });

  // Base UI の Select は items を渡さないと、選択中の値をラベルではなく
  // 生の値（UUID や __none__）のまま表示する。
  const employeeItems: Record<string, string> = {
    __none__: '選択してください',
    ...Object.fromEntries(
      employees.map((emp) => [emp.id, `${emp.fullName}（${emp.employeeCode}）`]),
    ),
  };

  function onSubmit(data: CreateOneOnOneInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateOneOnOneAction({ id: defaultValues!.id, ...data })
        : await createOneOnOneAction(data);

      if (result.success) {
        toast.success(isEdit ? '1on1記録を更新しました' : '1on1記録を作成しました');
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
          <DialogTitle>{isEdit ? '1on1を編集' : '1on1を記録'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '1on1記録の内容を変更します' : '新しい1on1ミーティングを記録します'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>対象従業員 *</Label>
            <Select
              items={employeeItems}
              value={employeeId || '__none__'}
              onValueChange={(val) => setValue('employeeId', !val || val === '__none__' ? '' : val)}
              disabled={isPending}
            >
              <SelectTrigger className="w-full" id="oo-employee">
                <SelectValue placeholder="従業員を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">選択してください</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}（{emp.employeeCode}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employeeId && (
              <p className="text-destructive text-xs">{errors.employeeId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>面談者 *</Label>
            <Select
              items={employeeItems}
              value={interviewerId || '__none__'}
              onValueChange={(val) =>
                setValue('interviewerId', !val || val === '__none__' ? '' : val)
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full" id="oo-interviewer">
                <SelectValue placeholder="面談者を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">選択してください</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}（{emp.employeeCode}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.interviewerId && (
              <p className="text-destructive text-xs">{errors.interviewerId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="oo-held-on">実施日 *</Label>
            <Input id="oo-held-on" type="date" disabled={isPending} {...register('heldOn')} />
            {errors.heldOn && <p className="text-destructive text-xs">{errors.heldOn.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>コンディション</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((score) => (
                <Button
                  key={score}
                  type="button"
                  variant={moodScore === score ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-10"
                  disabled={isPending}
                  onClick={() => setValue('moodScore', moodScore === score ? 0 : score)}
                >
                  {score}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">1（低い）〜 5（高い）</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oo-notes">メモ</Label>
            <Textarea
              id="oo-notes"
              placeholder="面談内容や所感を記録..."
              rows={4}
              disabled={isPending}
              {...register('notes')}
            />
            {errors.notes && <p className="text-destructive text-xs">{errors.notes.message}</p>}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              キャンセル
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '更新' : '記録'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
