'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * クライアント取得（TanStack Query）が失敗したときの表示。
 *
 * **失敗を空状態に落とさないための部品。** `useQuery` の `error` を見ずに
 * `data` の有無だけで分岐すると、取得に失敗したときも `data` は undefined に
 * なるため「まだ登録されていません」と出てしまう。人事の画面では
 * 「1on1が無い」と「1on1が読めなかった」を取り違えると判断を誤る。
 *
 * `error.tsx` はサーバー側のレンダリング失敗しか拾わない。画面の中で
 * 起きるクライアント取得の失敗はここで受ける。見た目は `error.tsx` に揃えて、
 * 利用者から見て同じ種類の出来事に見えるようにする。
 */
export function QueryErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="text-muted-foreground/50 h-12 w-12" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        ネットワーク接続を確認し、再度お試しください。
      </p>
      <Button className="mt-6" onClick={onRetry}>
        再試行
      </Button>
    </div>
  );
}
