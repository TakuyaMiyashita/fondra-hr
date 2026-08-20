'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createEvaluationSchema, type CreateEvaluationInput } from '@/lib/validations/evaluation';
import type { EmployeeOption } from '@/types/employee';

import { createEvaluationAction } from './actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  employees: EmployeeOption[];
  onSuccess: () => void;
}

export function EvaluationFormDialog({ open, onOpenChange, cycleId, employees, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const {
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateEvaluationInput>({
    resolver: zodResolver(createEvaluationSchema),
    defaultValues: {
      cycleId,
      employeeId: '',
      evaluatorId: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({ cycleId, employeeId: '', evaluatorId: '' });
    }
  }, [open, cycleId, reset]);

  // Base UI の Select は items を渡さないと、選択中の値をラベルではなく
  // 生の値（UUID や __none__）のまま表示する。
  const employeeItems: Record<string, string> = {
    __none__: '選択してください',
    ...Object.fromEntries(
      employees.map((emp) => [emp.id, `${emp.fullName}（${emp.employeeCode}）`]),
    ),
  };

  const employeeId = useWatch({ control, name: 'employeeId' });
  const evaluatorId = useWatch({ control, name: 'evaluatorId' });

  function onSubmit(data: CreateEvaluationInput) {
    startTransition(async () => {
      const result = await createEvaluationAction(data);
      if (result.success) {
        toast.success('評価を追加しました');
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
          <DialogTitle>評価を追加</DialogTitle>
          <DialogDescription>評価対象の従業員と評価者を選択します。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField invalid={!!errors.employeeId}>
            <FormLabel>対象従業員 *</FormLabel>
            <Select
              items={employeeItems}
              value={employeeId || '__none__'}
              onValueChange={(val) => setValue('employeeId', !val || val === '__none__' ? '' : val)}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
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
            <FormError>{errors.employeeId?.message}</FormError>
          </FormField>

          <FormField invalid={!!errors.evaluatorId}>
            <FormLabel>評価者 *</FormLabel>
            <Select
              items={employeeItems}
              value={evaluatorId || '__none__'}
              onValueChange={(val) =>
                setValue('evaluatorId', !val || val === '__none__' ? '' : val)
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="評価者を選択" />
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
            <FormError>{errors.evaluatorId?.message}</FormError>
          </FormField>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              キャンセル
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
