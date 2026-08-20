'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuthError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <AlertTriangle className="text-destructive size-12" />
        <CardTitle className="mt-4 text-2xl font-bold tracking-tight">問題が発生しました</CardTitle>
        <CardDescription>
          {error.message ||
            'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={retry}>
          再試行
        </Button>
      </CardContent>
    </Card>
  );
}
