import { UserX } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function EmployeeNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <UserX className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">従業員が見つかりません</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        指定された従業員は存在しないか、アクセス権がありません。
      </p>
      <Button className="mt-6" render={<Link href="/employees" />}>
        従業員一覧に戻る
      </Button>
    </div>
  );
}
