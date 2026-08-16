'use client';

import { Loader2 } from 'lucide-react';
import { useTransition } from 'react';
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

import { deleteEvaluationAction } from './actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluationId: string;
  employeeName: string;
  onSuccess: () => void;
}

export function EvaluationDeleteDialog({
  open,
  onOpenChange,
  evaluationId,
  employeeName,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteEvaluationAction(evaluationId);
      if (result.success) {
        toast.success('評価を削除しました');
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
          <DialogTitle>評価を削除</DialogTitle>
          <DialogDescription>
            {employeeName}の評価を削除しますか？この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            キャンセル
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            削除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
