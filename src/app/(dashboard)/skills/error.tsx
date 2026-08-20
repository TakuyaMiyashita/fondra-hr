'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function SkillsError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="text-destructive/50 h-12 w-12" />
      <h3 className="mt-4 text-lg font-semibold">スキルデータの取得に失敗しました</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        ネットワーク接続を確認して再度お試しください。
      </p>
      <Button className="mt-6" onClick={retry}>
        再試行
      </Button>
    </div>
  );
}
