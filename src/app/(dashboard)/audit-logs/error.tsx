'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function AuditLogsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="text-destructive/50 h-12 w-12" />
      <h3 className="mt-4 text-lg font-semibold">監査ログの取得に失敗しました</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        ネットワーク接続を確認して再度お試しください。
      </p>
      <Button className="mt-6" onClick={reset}>
        再試行
      </Button>
    </div>
  );
}
