'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function InviteAcceptError({
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
        <CardTitle className="mt-4 text-2xl font-bold tracking-tight">
          招待の読み込みに失敗しました
        </CardTitle>
        <CardDescription>
          {error.message ||
            'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button onClick={retry}>再試行</Button>
        <Button variant="ghost" render={<Link href="/login" />}>
          ログイン画面へ
        </Button>
      </CardContent>
    </Card>
  );
}
