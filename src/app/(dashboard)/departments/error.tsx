'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function DepartmentsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertTriangle className="text-destructive size-12" />
      <h3 className="mt-4 text-lg font-semibold">部署データの読み込みに失敗しました</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        {error.message ||
          'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。'}
      </p>
      <Button className="mt-6" onClick={retry}>
        再試行
      </Button>
    </div>
  );
}
