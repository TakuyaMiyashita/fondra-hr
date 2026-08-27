'use client';

import { Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { anonymizeEmployeeAction } from './actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
}

/**
 * 削除できない従業員の個人情報を落とす。
 *
 * 評価や 1on1 が紐づいた従業員は削除できない（他人が書いた記録まで消えるため）。
 * 個人情報の削除請求にはこちらで応える。
 */
export function EmployeeAnonymizeDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function handleAnonymize() {
    startTransition(async () => {
      const result = await anonymizeEmployeeAction(employeeId);
      if (result.success) {
        toast.success('従業員を匿名化しました');
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
          <DialogTitle>従業員の匿名化</DialogTitle>
          <DialogDescription>
            <strong>{employeeName}</strong>{' '}
            の氏名・フリガナ・メールアドレス・生年月日・顔写真・社員番号を消し、
            ログインアカウントとの紐付けを解除します。ステータスは「退職」になります。
            <br />
            <br />
            <strong>評価と1on1の記録は残ります。</strong>
            他の従業員の履歴でもあるため消しません。本文に個人情報が含まれている場合は、
            個別に編集してください。
            <br />
            <br />
            この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={handleAnonymize} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            匿名化する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
