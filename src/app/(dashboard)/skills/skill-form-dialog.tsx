'use client';
'use no memo';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ComboboxInput } from '@/components/shared/combobox-input';
import { FormDescription, FormError, FormField, FormLabel } from '@/components/shared/form-field';
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
  categoryForSkillName,
  mergeCategoryOptions,
  skillNameGroups,
} from '@/lib/constants/skill-presets';
import { createSkillSchema, type CreateSkillInput } from '@/lib/validations/skill';
import type { SkillWithCount } from '@/types/skill';

import { createSkillAction, updateSkillAction } from './actions';

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: SkillWithCount;
  /** この組織で実際に使われているカテゴリ。候補の先頭に出す。 */
  categories: string[];
  onSuccess: () => void;
}

export function SkillFormDialog({
  mode,
  open,
  onOpenChange,
  defaultValues,
  categories,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const isEdit = mode === 'edit';

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<CreateSkillInput>({
    resolver: zodResolver(createSkillSchema),
    defaultValues: defaultValues
      ? { name: defaultValues.name, category: defaultValues.category ?? '' }
      : { name: '', category: '' },
  });

  const name = useWatch({ control, name: 'name' });
  const category = useWatch({ control, name: 'category' });

  /**
   * 候補から選んだときだけカテゴリを補う。
   *
   * - 自由入力（picked=false）では触らない。打っている途中で勝手に変わるのは事故
   * - 編集モードでは触らない。名前を打ち直した拍子に既存のカテゴリが飛ぶため
   * - ユーザーが自分で触ったカテゴリは上書きしない
   */
  function handleNameChange(next: string, picked: boolean) {
    setValue('name', next, { shouldValidate: !!errors.name });
    if (!picked || isEdit || dirtyFields.category) return;

    const preset = categoryForSkillName(next);
    if (preset) setValue('category', preset, { shouldDirty: false });
  }

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
          <FormField invalid={!!errors.name}>
            <FormLabel htmlFor="skill-name">スキル名 *</FormLabel>
            <ComboboxInput
              id="skill-name"
              value={name ?? ''}
              onValueChange={handleNameChange}
              groups={skillNameGroups()}
              placeholder="React"
              disabled={isPending}
            />
            <FormDescription>候補から選ぶか、そのまま入力できます</FormDescription>
            <FormError>{errors.name?.message}</FormError>
          </FormField>

          <FormField invalid={!!errors.category}>
            <FormLabel htmlFor="skill-category">カテゴリ</FormLabel>
            <ComboboxInput
              id="skill-category"
              value={category ?? ''}
              onValueChange={(next) =>
                setValue('category', next, { shouldDirty: true, shouldValidate: !!errors.category })
              }
              groups={mergeCategoryOptions(categories)}
              placeholder="フロントエンド"
              disabled={isPending}
            />
            <FormError>{errors.category?.message}</FormError>
          </FormField>

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
