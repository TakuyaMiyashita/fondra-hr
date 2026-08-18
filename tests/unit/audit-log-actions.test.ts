import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * 監査ログ閲覧の Server Actions。
 *
 * 監査ログは「誰が何をしたか」の唯一の証跡なので、
 * 閲覧クエリが Service に届く前に必ず正規化されている必要がある。
 * perPage を無制限にできると全件ダンプによる情報流出・DoS になりうるため、
 * 上限の境界を明示的に検証する。
 *
 * fetchResourceTypes はフィルタ用の付随情報なので、
 * 例外を握り潰して空配列に落とす設計（画面全体を落とさない）。
 * これは意図的な差異なので、その振る舞い自体をテストで固定する。
 */

const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getAuthContext }));

vi.mock('@/services/audit-log', () => ({
  listAuditLogs: vi.fn(),
  getResourceTypes: vi.fn(),
}));

async function svc() {
  return vi.mocked(await import('@/services/audit-log'));
}

async function actions() {
  return import('@/app/(dashboard)/audit-logs/actions');
}

const EMPTY_RESULT = { logs: [], total: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
});

describe('fetchAuditLogs', () => {
  it('rejects page 0 without touching the service', async () => {
    const { fetchAuditLogs } = await actions();
    const s = await svc();

    expect((await fetchAuditLogs({ page: 0 } as never)).success).toBe(false);
    expect(s.listAuditLogs).not.toHaveBeenCalled();
  });

  it('rejects a perPage above the 100 row cap', async () => {
    // 上限を外せると監査ログ全件を一度に吸い出せてしまう。上限側の境界を固定する。
    const { fetchAuditLogs } = await actions();
    const s = await svc();

    expect((await fetchAuditLogs({ perPage: 101 } as never)).success).toBe(false);
    expect(s.listAuditLogs).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric page that cannot be coerced', async () => {
    const { fetchAuditLogs } = await actions();
    const s = await svc();

    expect((await fetchAuditLogs({ page: 'abc' } as never)).success).toBe(false);
    expect(s.listAuditLogs).not.toHaveBeenCalled();
  });

  it('rejects a fractional page number', async () => {
    const { fetchAuditLogs } = await actions();
    const s = await svc();

    expect((await fetchAuditLogs({ page: 1.5 } as never)).success).toBe(false);
    expect(s.listAuditLogs).not.toHaveBeenCalled();
  });

  it('rejects an unknown sort order', async () => {
    const { fetchAuditLogs } = await actions();
    const s = await svc();

    expect((await fetchAuditLogs({ order: 'sideways' } as never)).success).toBe(false);
    expect(s.listAuditLogs).not.toHaveBeenCalled();
  });

  it('applies schema defaults when the query is empty', async () => {
    // URL から欠けたパラメータが Service に undefined のまま渡ると
    // ページングが壊れる。デフォルトが埋まっていることを引数で確認する。
    const { fetchAuditLogs } = await actions();
    const s = await svc();
    s.listAuditLogs.mockResolvedValue(EMPTY_RESULT as never);

    expect(await fetchAuditLogs({} as never)).toEqual(ok(EMPTY_RESULT));
    expect(s.listAuditLogs).toHaveBeenCalledWith(ctxAdmin, {
      page: 1,
      perPage: 20,
      order: 'desc',
    });
  });

  it('coerces numeric strings coming from the URL', async () => {
    // nuqs 経由のクエリは文字列で届くため、coerce が効いていないと
    // 「2ページ目」が Service 側で文字列比較になり壊れる。
    const { fetchAuditLogs } = await actions();
    const s = await svc();
    s.listAuditLogs.mockResolvedValue(EMPTY_RESULT as never);

    await fetchAuditLogs({ page: '3', perPage: '50' } as never);

    expect(s.listAuditLogs).toHaveBeenCalledWith(
      ctxAdmin,
      expect.objectContaining({ page: 3, perPage: 50 }),
    );
  });

  it('forwards optional filters when supplied', async () => {
    const { fetchAuditLogs } = await actions();
    const s = await svc();
    s.listAuditLogs.mockResolvedValue(EMPTY_RESULT as never);

    await fetchAuditLogs({ resourceType: 'employee', action: 'delete', order: 'asc' } as never);

    expect(s.listAuditLogs).toHaveBeenCalledWith(
      ctxAdmin,
      expect.objectContaining({ resourceType: 'employee', action: 'delete', order: 'asc' }),
    );
  });

  it('converts AuthorizationError into a permission error', async () => {
    // 監査ログは admin 以上のみ。viewer/member には理由を漏らさず権限エラーで返す。
    const { fetchAuditLogs } = await actions();
    const s = await svc();
    s.listAuditLogs.mockRejectedValue(new AuthorizationError('read', 'audit_log'));

    expect(await fetchAuditLogs({} as never)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    const { fetchAuditLogs } = await actions();
    const s = await svc();
    s.listAuditLogs.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchAuditLogs({} as never)).rejects.toThrow('connection terminated');
  });

  it('rethrows when the AuthContext cannot be resolved', async () => {
    const { fetchAuditLogs } = await actions();
    getAuthContext.mockRejectedValue(new Error('No active session'));

    await expect(fetchAuditLogs({} as never)).rejects.toThrow('No active session');
  });
});

describe('fetchResourceTypes', () => {
  it('returns the distinct resource types from the service', async () => {
    const { fetchResourceTypes } = await actions();
    const s = await svc();
    s.getResourceTypes.mockResolvedValue(['employee', 'skill'] as never);

    expect(await fetchResourceTypes()).toEqual(['employee', 'skill']);
    expect(s.getResourceTypes).toHaveBeenCalledWith(ctxAdmin);
  });

  it('degrades to an empty list when the caller is not permitted', async () => {
    // フィルタ候補は画面の付随情報。権限が無い場合は例外ではなく空で返す設計。
    const { fetchResourceTypes } = await actions();
    const s = await svc();
    s.getResourceTypes.mockRejectedValue(new AuthorizationError('read', 'audit_log'));

    expect(await fetchResourceTypes()).toEqual([]);
  });

  it('also degrades to an empty list on infrastructure errors', async () => {
    // fetchAuditLogs と違い、ここは catch-all で握り潰す実装。
    // 意図的な差異なので、振る舞いとして固定しておく（変更されたら気付ける）。
    const { fetchResourceTypes } = await actions();
    const s = await svc();
    s.getResourceTypes.mockRejectedValue(new Error('connection terminated'));

    expect(await fetchResourceTypes()).toEqual([]);
  });

  it('degrades to an empty list when the AuthContext cannot be resolved', async () => {
    const { fetchResourceTypes } = await actions();
    const s = await svc();
    getAuthContext.mockRejectedValue(new Error('No active session'));

    expect(await fetchResourceTypes()).toEqual([]);
    expect(s.getResourceTypes).not.toHaveBeenCalled();
  });
});
