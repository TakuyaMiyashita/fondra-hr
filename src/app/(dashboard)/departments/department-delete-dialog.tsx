'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
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
import type { Department } from '@/types/department';

import { deleteDepartmentAction } from './actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
  onSuccess: () => void;
}

export function DepartmentDeleteDialog({ open, onOpenChange, department, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!department) return;

    startTransition(async () => {
      const result = await deleteDepartmentAction(department.id);

      if (result.success) {
        toast.success('部署を削除しました');
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
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive h-5 w-5" />
            部署を削除
          </DialogTitle>
          <DialogDescription>
            <strong>{department?.name}</strong> を削除しますか？この操作は元に戻せません。
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          子部署や所属する従業員が存在する場合は削除できません。
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>キャンセル</DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            削除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
