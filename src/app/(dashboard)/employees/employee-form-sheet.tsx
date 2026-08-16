'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  createEmployeeSchema,
  type CreateEmployeeInput,
} from '@/lib/validations/employee';
import type { z } from 'zod';

type FormInput = z.input<typeof createEmployeeSchema>;
import type { DepartmentOption, EmployeeDetail } from '@/types/employee';

import { createEmployeeAction, updateEmployeeAction } from './actions';

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: EmployeeDetail;
  departments: DepartmentOption[];
  onSuccess: () => void;
}

export function EmployeeFormSheet({
  mode,
  open,
  onOpenChange,
  defaultValues,
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
  } = useForm<FormInput, unknown, CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: defaultValues
      ? {
          employeeCode: defaultValues.employeeCode,
          fullName: defaultValues.fullName,
          fullNameKana: defaultValues.fullNameKana ?? '',
          email: defaultValues.email ?? '',
          departmentId: defaultValues.departmentId ?? '',
          position: defaultValues.position ?? '',
          hiredOn: defaultValues.hiredOn ?? '',
          birthDate: defaultValues.birthDate ?? '',
          status: defaultValues.status,
        }
      : {
          employeeCode: '',
          fullName: '',
          fullNameKana: '',
          email: '',
          departmentId: '',
          position: '',
          hiredOn: '',
          birthDate: '',
          status: 'active',
        },
  });

  const departmentId = watch('departmentId');
  const status = watch('status');

  function onSubmit(data: CreateEmployeeInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateEmployeeAction({ id: defaultValues!.id, ...data })
        : await createEmployeeAction(data);

      if (result.success) {
        toast.success(isEdit ? '従業員情報を更新しました' : '従業員を登録しました');
        reset();
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? '従業員を編集' : '従業員を登録'}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-y-auto px-4"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employeeCode">社員番号 *</Label>
              <Input
                id="employeeCode"
                placeholder="EMP-001"
                disabled={isPending}
                {...register('employeeCode')}
              />
              {errors.employeeCode && (
                <p className="text-xs text-destructive">{errors.employeeCode.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">氏名 *</Label>
              <Input
                id="fullName"
                placeholder="田中 太郎"
                disabled={isPending}
                {...register('fullName')}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullNameKana">フリガナ</Label>
              <Input
                id="fullNameKana"
                placeholder="タナカ タロウ"
                disabled={isPending}
                {...register('fullNameKana')}
              />
              {errors.fullNameKana && (
                <p className="text-xs text-destructive">{errors.fullNameKana.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="tanaka@example.com"
                disabled={isPending}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>部署</Label>
              <Select
                value={departmentId || undefined}
                onValueChange={(val) => setValue('departmentId', val as string)}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="部署を選択" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.departmentId && (
                <p className="text-xs text-destructive">{errors.departmentId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="position">役職</Label>
              <Input
                id="position"
                placeholder="マネージャー"
                disabled={isPending}
                {...register('position')}
              />
              {errors.position && (
                <p className="text-xs text-destructive">{errors.position.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hiredOn">入社日</Label>
              <Input
                id="hiredOn"
                type="date"
                disabled={isPending}
                {...register('hiredOn')}
              />
              {errors.hiredOn && (
                <p className="text-xs text-destructive">{errors.hiredOn.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate">生年月日</Label>
              <Input
                id="birthDate"
                type="date"
                disabled={isPending}
                {...register('birthDate')}
              />
              {errors.birthDate && (
                <p className="text-xs text-destructive">{errors.birthDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select
                value={status}
                onValueChange={(val) => setValue('status', val as CreateEmployeeInput['status'])}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">在籍</SelectItem>
                  <SelectItem value="inactive">休職</SelectItem>
                  <SelectItem value="retired">退職</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <SheetClose render={<Button variant="outline" type="button" />}>
              キャンセル
            </SheetClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '更新' : '登録'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
