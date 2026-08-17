'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function EmployeesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertTriangle className="text-destructive size-12" />
      <h3 className="mt-4 text-lg font-semibold">従業員データの読み込みに失敗しました</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        {error.message ||
          'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。'}
      </p>
      <Button className="mt-6" onClick={reset}>
        再試行
      </Button>
    </div>
  );
}
