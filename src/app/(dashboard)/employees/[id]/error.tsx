'use client';

import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export default function EmployeeDetailError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="text-muted-foreground/50 h-12 w-12" />
      <h3 className="mt-4 text-lg font-semibold">従業員情報の取得に失敗しました</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        ネットワーク接続を確認し、再度お試しください。
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={() => router.push('/employees')}>
          一覧に戻る
        </Button>
        <Button onClick={retry}>再試行</Button>
      </div>
    </div>
  );
}
