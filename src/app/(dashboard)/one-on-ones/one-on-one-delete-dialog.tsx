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

import { deleteOneOnOneAction } from './actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  employeeName: string;
  heldOn: string;
  onSuccess: () => void;
}

export function OneOnOneDeleteDialog({
  open,
  onOpenChange,
  recordId,
  employeeName,
  heldOn,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteOneOnOneAction(recordId);
      if (result.success) {
        toast.success('1on1記録を削除しました');
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
          <DialogTitle>1on1記録を削除</DialogTitle>
          <DialogDescription>
            {employeeName}の1on1記録（{heldOn}）を削除しますか？この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>キャンセル</DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            削除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
