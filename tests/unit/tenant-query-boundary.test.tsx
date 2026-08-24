import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TenantQueryBoundary } from '@/components/layout/tenant-query-boundary';

/**
 * 組織切替はサーバー側の redirect（＝クライアントサイドのナビゲーション）で
 * 行われるため、QueryClient は生き残る。一覧系のクエリキーには組織を表す値が
 * 入っていないので、何もしないと前の組織のデータが描画される。
 *
 * このテストは「対策が無ければ前組織のデータが出る」ことも一緒に押さえる。
 * 対照が無いと、キャッシュが偶然空でも通ってしまう。
 */

const LIST_KEY = ['employees'] as const;

function List({ initialData }: { initialData: string }) {
  const { data } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => 'FETCHED',
    initialData,
    staleTime: 30_000,
  });
  return <div>{data}</div>;
}

describe('TenantQueryBoundary', () => {
  it('組織が変わるとキャッシュを捨て、新しい組織のデータを描画する', () => {
    const queryClient = new QueryClient();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-A">
          <List initialData="ORG-A-DATA" />
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );
    expect(screen.getByText('ORG-A-DATA')).toBeInTheDocument();
    unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-B">
          <List initialData="ORG-B-DATA" />
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('ORG-B-DATA')).toBeInTheDocument();
    expect(screen.queryByText('ORG-A-DATA')).not.toBeInTheDocument();
  });

  it('対照: 境界が無いと前の組織のデータが残る', () => {
    // この挙動を実際に確認したうえで境界を入れている。
    // 対照が通らなくなったら、TanStack 側の挙動が変わったということ。
    const queryClient = new QueryClient();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <List initialData="ORG-A-DATA" />
      </QueryClientProvider>,
    );
    unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <List initialData="ORG-B-DATA" />
      </QueryClientProvider>,
    );

    expect(screen.getByText('ORG-A-DATA')).toBeInTheDocument();
  });

  it('再マウントされずに prop だけ変わった場合も捨てる', () => {
    // 実アプリではレイアウトが残ったまま orgId だけ変わる（クライアント遷移）。
    // 逆にテストの1件目は再マウントの経路。判定を QueryClient 側に
    // 持たせているので、どちらでも効く。
    const queryClient = new QueryClient();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-A">
          <List initialData="ORG-A-DATA" />
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );
    expect(screen.getByText('ORG-A-DATA')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-B">
          <List initialData="ORG-B-DATA" />
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('ORG-B-DATA')).toBeInTheDocument();
  });

  it('同じ組織のままなら再描画でキャッシュを捨てない', () => {
    // 画面遷移のたびに捨てると、取得済みのデータが毎回消えて
    // 一覧が毎回点滅する。捨てるのは組織が変わったときだけ。
    const queryClient = new QueryClient();
    const clear = vi.spyOn(queryClient, 'clear');

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-A">
          <div>子</div>
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-A">
          <div>子</div>
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );

    expect(clear).not.toHaveBeenCalled();
  });

  it('子はそのまま描画される', () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TenantQueryBoundary orgId="org-A">
          <div>中身</div>
        </TenantQueryBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('中身')).toBeInTheDocument();
  });
});
