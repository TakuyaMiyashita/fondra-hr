import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * TanStack Query に依存するクライアントコンポーネント用の render。
 *
 * - retry を無効化する。既定の指数バックオフ付きリトライが働くと、
 *   失敗系のテストが数秒待たされたうえにタイムアウトするため。
 * - QueryClient はテストごとに作り直す。キャッシュが持ち越されると
 *   別のテストの取得結果が描画され、順序依存の偽陽性になる。
 */
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
