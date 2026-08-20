import { FileQuestion } from 'lucide-react';
import type { Metadata } from 'next';

import { ButtonLink } from '@/components/shared/button-link';

export const metadata: Metadata = {
  title: 'ページが見つかりません',
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <FileQuestion className="text-muted-foreground/50 size-12" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">ページが見つかりません</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        お探しのページは存在しないか、移動された可能性があります。
      </p>
      <ButtonLink className="mt-6" href="/">
        トップに戻る
      </ButtonLink>
    </div>
  );
}
