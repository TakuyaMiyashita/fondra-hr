'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

/**
 * テナントが切り替わったら TanStack Query のキャッシュを捨てる。
 *
 * 組織切替（`switchOrg`）はサーバー側の `redirect()` で行われる。これは
 * クライアントサイドのナビゲーションなので、React のツリー＝`Providers` が
 * 持つ `QueryClient` は**生き残る**。
 *
 * 一覧系のクエリキーには組織を表す値が入っていない（`['employees', ...]`、
 * `['skill-matrix', ...]`）。そのため切り替え後も前の組織のデータが
 * キャッシュに残り、そのまま描画される。しかも `staleTime` の間は
 * 再取得も走らないので、自然には直らない。
 *
 * 実際に確かめた挙動:
 *   1. 組織Aの一覧を表示（キャッシュに載る）
 *   2. 組織Bへ切り替え。RSC は新しい initialData を渡す
 *   3. → 描画されるのは**組織Aのデータ**、再取得は 0 回
 *
 * キーひとつひとつに org_id を混ぜる案もあるが、新しいクエリを足すたびに
 * 思い出す必要があり、忘れれば同じ穴が開く。テナントが変わったら
 * **クライアント側の取得済みデータは全部捨てる**方が入口がひとつで済む。
 */

/**
 * 「この QueryClient が今どの組織のデータを持っているか」。
 *
 * コンポーネント側の ref ではなく QueryClient に紐付けるのが要。
 * ref はコンポーネントが再マウントされると初期化され、
 * 「変わっていない」と誤判定してキャッシュを捨て損ねる。
 * 捨てるべきかどうかを決めるのはキャッシュの持ち主の寿命なので、
 * そちらに合わせる。WeakMap なので QueryClient と一緒に回収される。
 */
const orgIdByQueryClient = new WeakMap<QueryClient, string>();

export function TenantQueryBoundary({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const cachedOrgId = orgIdByQueryClient.get(queryClient);

  // レンダー中に消しているのは、`useEffect` だと子が描画されたあとに走り、
  // 前の組織のデータが一瞬見えてしまうため。
  if (cachedOrgId !== undefined && cachedOrgId !== orgId) {
    queryClient.clear();
  }
  orgIdByQueryClient.set(queryClient, orgId);

  return <>{children}</>;
}
