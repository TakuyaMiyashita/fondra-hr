import { UserX } from 'lucide-react';

import { ButtonLink } from '@/components/shared/button-link';

export default function EmployeeNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <UserX className="text-muted-foreground/50 h-12 w-12" />
      <h3 className="mt-4 text-lg font-semibold">従業員が見つかりません</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        指定された従業員は存在しないか、アクセス権がありません。
      </p>
      <ButtonLink className="mt-6" href="/employees">
        従業員一覧に戻る
      </ButtonLink>
    </div>
  );
}
