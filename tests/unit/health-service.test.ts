import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 死活確認は「DB が落ちて画面が全滅している」状況で使うもの。
 * その状況で確実に false を返し、例外で落ちないことが要件。
 */
vi.mock('@/db', () => ({ db: { execute: vi.fn() } }));

async function getDb() {
  const mod = await import('@/db');
  return mod.db as unknown as { execute: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isDatabaseReachable', () => {
  it('クエリが通れば true', async () => {
    const { isDatabaseReachable } = await import('@/services/health');
    (await getDb()).execute.mockResolvedValue([{ '?column?': 1 }]);

    await expect(isDatabaseReachable()).resolves.toBe(true);
  });

  it('接続に失敗しても例外を投げず false を返す', async () => {
    // ここで throw すると Next のエラー画面になり、死活確認の役に立たない。
    const { isDatabaseReachable } = await import('@/services/health');
    (await getDb()).execute.mockRejectedValue(new Error('password authentication failed'));

    await expect(isDatabaseReachable()).resolves.toBe(false);
  });

  it('Error 以外が throw されても false を返す', async () => {
    const { isDatabaseReachable } = await import('@/services/health');
    (await getDb()).execute.mockRejectedValue('文字列が throw された');

    await expect(isDatabaseReachable()).resolves.toBe(false);
  });
});
