import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';

import { ALL_ROLES, CTX_BY_ROLE, ctxOtherOrg } from '../helpers/auth-fixtures';
import { type ChainMock, createChainMock, createSequentialSelect } from '../helpers/db-mock';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const viewerCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'viewer' };

let selectChain: ChainMock;

vi.mock('@/db', () => {
  const mockDb = {
    select: vi.fn(),
  };
  return { db: mockDb };
});

async function getDb() {
  const mod = await import('@/db');
  return mod.db as unknown as {
    select: ReturnType<typeof vi.fn>;
  };
}

/** drizzle の SQL 式から「カラム名 = 束縛値」の組を再帰的に取り出す。 */
function collectParams(
  node: unknown,
  acc: { column: string; value: unknown }[] = [],
): { column: string; value: unknown }[] {
  if (!node || typeof node !== 'object') return acc;
  const n = node as Record<string, unknown>;
  const encoder = n.encoder as Record<string, unknown> | undefined;
  if (encoder && typeof encoder.name === 'string') {
    acc.push({ column: encoder.name, value: n.value });
  }
  if (Array.isArray(n.queryChunks)) {
    for (const chunk of n.queryChunks) collectParams(chunk, acc);
  }
  return acc;
}

/** n 番目の db.select() が受け取った where 条件のパラメータ一覧。 */
async function whereParamsOf(callIndex: number) {
  const db = await getDb();
  const chain = db.select.mock.results[callIndex].value as ChainMock;
  return collectParams(chain.where.mock.calls[0][0]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  selectChain = createChainMock([]);
  const db = await getDb();
  db.select.mockReturnValue(selectChain);
});

describe('getDashboardStats', () => {
  it('returns aggregated stats', async () => {
    const { getDashboardStats } = await import('@/services/dashboard');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ count: 10 }]).then(cb));

    const result = await getDashboardStats(adminCtx);

    expect(result).toEqual({
      employeeCount: 10,
      departmentCount: 10,
      skillCount: 10,
      activeCycleCount: 10,
    });
  });

  it('allows viewer to read dashboard', async () => {
    const { getDashboardStats } = await import('@/services/dashboard');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([{ count: 0 }]).then(cb));

    const result = await getDashboardStats(viewerCtx);

    expect(result.employeeCount).toBe(0);
  });

  it('4本の集計クエリの結果を取り違えずにマッピングする', async () => {
    // Promise.all で並行実行しているため、順序（従業員→部署→スキル→評価サイクル）が
    // ずれると画面の数字が入れ替わる。全て同じ値だと検出できないので別々の値で確認する。
    const { getDashboardStats } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ count: 42 }], [{ count: 7 }], [{ count: 15 }], [{ count: 2 }]]),
    );

    const result = await getDashboardStats(adminCtx);

    expect(result).toEqual({
      employeeCount: 42,
      departmentCount: 7,
      skillCount: 15,
      activeCycleCount: 2,
    });
  });

  it('データが1件も無い組織では全て 0 を返す（null や NaN にならない）', async () => {
    // 組織作成直後の初回ログインで必ず通る経路。
    const { getDashboardStats } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ count: 0 }], [{ count: 0 }], [{ count: 0 }], [{ count: 0 }]]),
    );

    const result = await getDashboardStats(adminCtx);

    expect(result).toEqual({
      employeeCount: 0,
      departmentCount: 0,
      skillCount: 0,
      activeCycleCount: 0,
    });
    expect(Object.values(result).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('全クエリが自組織の org_id で絞られている', async () => {
    // ダッシュボードは4テーブルを横断するため、1本でも org_id を落とすと
    // 他テナントの件数が数字として漏れる。
    const { getDashboardStats } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 1 }]]));

    await getDashboardStats(adminCtx);

    for (let i = 0; i < 4; i++) {
      expect(await whereParamsOf(i)).toContainEqual({ column: 'org_id', value: 'org-1' });
    }
    // 在籍者数は active のみ、評価サイクルは進行中のみを数える。
    expect(await whereParamsOf(0)).toContainEqual({ column: 'status', value: 'active' });
    expect(await whereParamsOf(3)).toContainEqual({ column: 'status', value: 'in_progress' });
  });

  it('別テナントのコンテキストでは、そのテナントの org_id で絞られる', async () => {
    const { getDashboardStats } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 1 }]]));

    await getDashboardStats(ctxOtherOrg);

    expect(await whereParamsOf(0)).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(await whereParamsOf(0)).not.toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it.each(ALL_ROLES)('%s ロールはダッシュボードを閲覧できる', async (role) => {
    // ダッシュボードは read 操作のみ。authorize() は viewer の書き込みのみを弾くため
    // 「拒否される1つ下のロール」は存在しない＝全ロール許可が仕様。
    const { getDashboardStats } = await import('@/services/dashboard');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([{ count: 1 }]).then(cb));

    await expect(getDashboardStats(CTX_BY_ROLE[role])).resolves.toBeDefined();
  });
});

describe('getRecentActivity', () => {
  it('returns recent activity list', async () => {
    const { getRecentActivity } = await import('@/services/dashboard');

    const activities = [
      {
        id: 'a1',
        actorEmail: 'admin@example.com',
        action: 'employee.create',
        resourceType: 'employee',
        createdAt: new Date(),
      },
    ];
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve(activities).then(cb));

    const result = await getRecentActivity(adminCtx);

    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('employee.create');
  });

  it('returns empty array when no activity', async () => {
    const { getRecentActivity } = await import('@/services/dashboard');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await getRecentActivity(adminCtx);

    expect(result).toEqual([]);
  });

  it('limit 省略時は 10 件、指定時はその件数を DB に渡す', async () => {
    // limit がクエリに渡っていないと監査ログ全件をメモリに載せることになる。
    const { getRecentActivity } = await import('@/services/dashboard');

    await getRecentActivity(adminCtx);
    expect(selectChain.limit).toHaveBeenCalledWith(10);

    selectChain.limit.mockClear();
    await getRecentActivity(adminCtx, 3);
    expect(selectChain.limit).toHaveBeenCalledWith(3);
  });

  it('自組織の監査ログのみを新しい順で取得する', async () => {
    const { getRecentActivity } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getRecentActivity(adminCtx);

    expect(await whereParamsOf(0)).toContainEqual({ column: 'org_id', value: 'org-1' });
    const chain = db.select.mock.results[0].value as ChainMock;
    expect(chain.orderBy).toHaveBeenCalled();
    // 実行者メールは auth.users との left join で解決する（削除済みユーザーでも行が消えない）。
    expect(chain.leftJoin).toHaveBeenCalled();
  });

  it('viewer も最近のアクティビティを閲覧できる', async () => {
    const { getRecentActivity } = await import('@/services/dashboard');

    await expect(getRecentActivity(viewerCtx)).resolves.toEqual([]);
  });
});

describe('getDepartmentHeadcounts', () => {
  it('部署ごとの在籍人数を返す', async () => {
    const { getDepartmentHeadcounts } = await import('@/services/dashboard');

    const rows = [
      { name: '開発部', count: 12 },
      { name: '営業部', count: 5 },
    ];
    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([rows]));

    await expect(getDepartmentHeadcounts(adminCtx)).resolves.toEqual(rows);
  });

  it('従業員が 0 人の部署も 0 件として残る（left join）', async () => {
    // inner join にしてしまうと「人がいない部署」がグラフから消える。
    // クエリが left join を使っていることを構造として固定する。
    const { getDepartmentHeadcounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ name: '新設部署', count: 0 }]]));

    const result = await getDepartmentHeadcounts(adminCtx);

    expect(result).toEqual([{ name: '新設部署', count: 0 }]);
    const chain = db.select.mock.results[0].value as ChainMock;
    expect(chain.leftJoin).toHaveBeenCalled();
    expect(chain.groupBy).toHaveBeenCalled();
  });

  it('部署が 1 件も無ければ空配列を返す', async () => {
    const { getDepartmentHeadcounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getDepartmentHeadcounts(adminCtx)).resolves.toEqual([]);
  });

  it('自組織の部署のみを集計する', async () => {
    const { getDepartmentHeadcounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getDepartmentHeadcounts(ctxOtherOrg);

    expect(await whereParamsOf(0)).toContainEqual({ column: 'org_id', value: 'org-2' });
  });

  it('viewer も閲覧できる', async () => {
    const { getDepartmentHeadcounts } = await import('@/services/dashboard');

    await expect(getDepartmentHeadcounts(viewerCtx)).resolves.toEqual([]);
  });
});

describe('getSkillCategoryCounts', () => {
  it('カテゴリごとの保有スキル数を返す', async () => {
    const { getSkillCategoryCounts } = await import('@/services/dashboard');

    const rows = [
      { category: 'フロントエンド', count: 9 },
      { category: '未分類', count: 2 },
    ];
    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([rows]));

    await expect(getSkillCategoryCounts(adminCtx)).resolves.toEqual(rows);
  });

  it('スキル割り当てが無ければ空配列を返す', async () => {
    // inner join のため割り当てゼロなら行自体が返らない。
    // 呼び出し側のグラフが空配列で壊れないことの担保。
    const { getSkillCategoryCounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getSkillCategoryCounts(adminCtx)).resolves.toEqual([]);
  });

  it('category が null のスキルは「未分類」に畳まれる', async () => {
    // coalesce を使っているため group by キーが null にならない。
    const { getSkillCategoryCounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ category: '未分類', count: 3 }]]));

    const result = await getSkillCategoryCounts(adminCtx);

    expect(result[0].category).toBe('未分類');
    const chain = db.select.mock.results[0].value as ChainMock;
    expect(chain.groupBy).toHaveBeenCalled();
    expect(chain.innerJoin).toHaveBeenCalled();
  });

  it('自組織のスキルのみを集計する', async () => {
    const { getSkillCategoryCounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getSkillCategoryCounts(adminCtx);

    expect(await whereParamsOf(0)).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('viewer も閲覧できる', async () => {
    const { getSkillCategoryCounts } = await import('@/services/dashboard');

    await expect(getSkillCategoryCounts(viewerCtx)).resolves.toEqual([]);
  });
});

describe('getEmployeeStatusCounts', () => {
  it('在籍ステータスごとの人数を返す', async () => {
    const { getEmployeeStatusCounts } = await import('@/services/dashboard');

    const rows = [
      { status: 'active', count: 20 },
      { status: 'retired', count: 3 },
    ];
    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([rows]));

    await expect(getEmployeeStatusCounts(adminCtx)).resolves.toEqual(rows);
  });

  it('従業員が 0 人なら空配列を返す', async () => {
    const { getEmployeeStatusCounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getEmployeeStatusCounts(adminCtx)).resolves.toEqual([]);
  });

  it('自組織の従業員のみを status で group by する', async () => {
    const { getEmployeeStatusCounts } = await import('@/services/dashboard');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getEmployeeStatusCounts(ctxOtherOrg);

    expect(await whereParamsOf(0)).toContainEqual({ column: 'org_id', value: 'org-2' });
    const chain = db.select.mock.results[0].value as ChainMock;
    expect(chain.groupBy).toHaveBeenCalled();
  });

  it('viewer も閲覧できる', async () => {
    const { getEmployeeStatusCounts } = await import('@/services/dashboard');

    await expect(getEmployeeStatusCounts(viewerCtx)).resolves.toEqual([]);
  });
});
