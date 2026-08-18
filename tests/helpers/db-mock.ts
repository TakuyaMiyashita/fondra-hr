import { vi } from 'vitest';

/**
 * Drizzle のクエリビルダを模したチェーンモック。
 *
 * Drizzle は `db.select().from().where().orderBy()...` と自身を返し続け、
 * 最後に await されたときに thenable として解決する。その形をそのまま再現する。
 *
 * 各テストファイルで同じものを手書きしていたため共通化した。
 */
export type ChainMock = Record<string, ReturnType<typeof vi.fn>>;

export function createChainMock(resolvedValue: unknown = []): ChainMock {
  const chain: ChainMock = {};
  const resolve = () => Promise.resolve(resolvedValue);

  for (const method of [
    'select',
    'selectDistinct',
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'groupBy',
    'having',
    'leftJoin',
    'innerJoin',
    'rightJoin',
    'insert',
    'values',
    'update',
    'set',
    'delete',
    'onConflictDoNothing',
    'onConflictDoUpdate',
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  chain.returning = vi.fn().mockImplementation(resolve);
  chain.as = vi.fn().mockReturnValue({ id: 'sub.id', fullName: 'sub.fullName' });
  chain.then = vi.fn().mockImplementation((onFulfilled) => resolve().then(onFulfilled));

  return chain;
}

/**
 * db.select() が呼ばれた順に別の結果を返すモックを組み立てる。
 *
 * Service Layer には「本体クエリ」と「総件数クエリ」のように
 * 1メソッド内で複数回 select するものが多く、順番に結果を差し替えたい場面が多い。
 */
export function createSequentialSelect(results: unknown[]) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const value = results[Math.min(callIndex, results.length - 1)];
    callIndex += 1;
    return createChainMock(value);
  });
}
