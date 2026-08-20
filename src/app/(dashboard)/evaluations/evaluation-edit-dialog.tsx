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
import { Textarea } from '@/components/ui/textarea';
import {
  updateEvaluationSchema,
  type UpdateEvaluationInput,
  type EvaluationStatus,
} from '@/lib/validations/evaluation';
import type { Evaluation } from '@/types/evaluation';

import { updateEvaluationAction } from './actions';

const RATING_CATEGORIES = [
  { key: 'performance', label: '業績' },
  { key: 'competency', label: '能力' },
  { key: 'attitude', label: '態度' },
];

// Base UI の Select は items を渡さないと、選択中の値をラベルではなく
// 生の値（draft / submitted など）のまま表示する。
const STATUS_ITEMS: Record<string, string> = {
  draft: '下書き',
  in_progress: '入力中',
  submitted: '提出',
  confirmed: '確定',
  returned: '差戻し',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluation: Evaluation;
  onSuccess: () => void;
}

export function EvaluationEditDialog({ open, onOpenChange, evaluation, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const existingRatings = (evaluation.ratings ?? {}) as Record<string, number>;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<UpdateEvaluationInput>({
    resolver: zodResolver(updateEvaluationSchema),
    defaultValues: {
      id: evaluation.id,
      ratings: existingRatings,
      comment: evaluation.comment ?? '',
      status: evaluation.status,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        id: evaluation.id,
        ratings: (evaluation.ratings ?? {}) as Record<string, number>,
        comment: evaluation.comment ?? '',
        status: evaluation.status,
      });
    }
  }, [open, evaluation, reset]);

  const ratings = useWatch({ control, name: 'ratings' }) ?? {};
  const status = useWatch({ control, name: 'status' });

  function setRating(key: string, value: number) {
    const current = { ...ratings };
    current[key] = value;
    setValue('ratings', current);
  }

  function onSubmit(data: UpdateEvaluationInput) {
    startTransition(async () => {
      const result = await updateEvaluationAction(data);
      if (result.success) {
        toast.success('評価を更新しました');
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>評価入力</DialogTitle>
          <DialogDescription>
            {evaluation.employeeName}（{evaluation.employeeCode}）の評価
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 5項目 × 5段階。名前を与えないと「1」〜「5」のボタンが25個並ぶだけになり、
              どの項目の何点なのか読み上げで判別できない。 */}
          <div role="group" aria-labelledby="eval-ratings-label" className="space-y-3">
            <span id="eval-ratings-label" className="text-sm leading-none font-medium select-none">
              評価項目
            </span>
            {RATING_CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                role="group"
                aria-labelledby={`eval-cat-${cat.key}`}
                className="flex items-center gap-3"
              >
                <span id={`eval-cat-${cat.key}`} className="w-16 text-sm">
                  {cat.label}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <Button
                      key={score}
                      type="button"
                      variant={ratings[cat.key] === score ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 w-10"
                      disabled={isPending}
                      aria-pressed={ratings[cat.key] === score}
                      aria-label={`${cat.label} ${score}`}
                      onClick={() => setRating(cat.key, score)}
                    >
                      {score}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">1（低い）〜 5（高い）</p>
          </div>

          <FormField invalid={!!errors.comment}>
            <FormLabel htmlFor="eval-comment">コメント</FormLabel>
            <Textarea
              id="eval-comment"
              placeholder="評価コメントを入力..."
              rows={4}
              disabled={isPending}
              {...register('comment')}
            />
            <FormError>{errors.comment?.message}</FormError>
          </FormField>

          <FormField>
            <FormLabel>ステータス</FormLabel>
            <Select
              items={STATUS_ITEMS}
              value={status || evaluation.status}
              onValueChange={(val) => {
                if (val) setValue('status', val as EvaluationStatus);
              }}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              キャンセル
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
