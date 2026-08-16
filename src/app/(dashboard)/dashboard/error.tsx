'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive/50" />
      <h3 className="mt-4 text-lg font-semibold">
        ダッシュボードの読み込みに失敗しました
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        ネットワーク接続を確認して再度お試しください。
      </p>
      <Button className="mt-6" onClick={reset}>
        再試行
      </Button>
    </div>
  );
}
