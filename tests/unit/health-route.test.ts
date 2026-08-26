import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 認証を要求しない経路なので、**外に出してよい情報だけ**を返すことを固定する。
 */
vi.mock('@/services/health', () => ({ isDatabaseReachable: vi.fn() }));

async function svc() {
  return vi.mocked(await import('@/services/health'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('DB に到達できれば 200 と ok を返す', async () => {
    const { GET } = await import('@/app/api/health/route');
    (await svc()).isDatabaseReachable.mockResolvedValue(true);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', database: 'ok' });
  });

  it('DB に到達できなければ 503 を返す', async () => {
    // 200 を返すと監視から見て「正常」になり気付けない。
    const { GET } = await import('@/app/api/health/route');
    (await svc()).isDatabaseReachable.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: 'error', database: 'error' });
  });

  it('失敗時のレスポンスに接続情報を含めない', async () => {
    const { GET } = await import('@/app/api/health/route');
    (await svc()).isDatabaseReachable.mockResolvedValue(false);

    const body = await (await GET()).text();

    for (const secret of ['postgresql://', 'password', '6543', 'pooler']) {
      expect(body).not.toContain(secret);
    }
  });
});
