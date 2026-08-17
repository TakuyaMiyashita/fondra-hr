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

import { deleteSkillAction } from './actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: string;
  skillName: string;
  onSuccess: () => void;
}

export function SkillDeleteDialog({ open, onOpenChange, skillId, skillName, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSkillAction(skillId);
      if (result.success) {
        toast.success('スキルを削除しました');
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
          <DialogTitle>スキルを削除</DialogTitle>
          <DialogDescription>
            「{skillName}」を削除しますか？この操作は取り消せません。
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
