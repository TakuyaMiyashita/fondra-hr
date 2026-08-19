import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

import { CTX_BY_ROLE, ctxOtherOrg, rolesAtLeast, rolesBelow } from '../helpers/auth-fixtures';

const ownerCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'owner' };
const adminCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'admin' };
const memberCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'member' };
const viewerCtx: AuthContext = { userId: 'user-4', orgId: 'org-1', role: 'viewer' };

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const resolve = () => Promise.resolve(resolvedValue);

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.as = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockImplementation(resolve);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);

  chain.then = vi.fn().mockImplementation((onFulfilled) => resolve().then(onFulfilled));

  return chain;
}

let selectChain: ReturnType<typeof createChainMock>;
let insertChain: ReturnType<typeof createChainMock>;
let updateChain: ReturnType<typeof createChainMock>;
let deleteChain: ReturnType<typeof createChainMock>;

vi.mock('@/db', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { db: mockDb };
});

async function getDb() {
  const mod = await import('@/db');
  return mod.db as unknown as {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
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

/** drizzle の SQL 式を、演算子や並び順が読める程度のテキストに落とす。 */
function sqlText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.queryChunks)) return n.queryChunks.map(sqlText).join('');
  if (n.encoder) return '?';
  if (typeof n.name === 'string' && 'table' in n) return String(n.name);
  if (Array.isArray(n.value)) return (n.value as string[]).join('');
  return '';
}

/**
 * db.select() が呼ばれた順に別の結果を返すモック。
 *
 * getCycle は従業員テーブルのサブクエリを2本組み立てるため、
 * `.as(alias)` が実カラムを持つオブジェクトを返す必要がある。
 */
function createSelectSequence(results: unknown[]) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const chain = createChainMock(results[Math.min(callIndex, results.length - 1)]);
    callIndex += 1;
    chain.as = vi.fn().mockImplementation((alias: string) => ({
      id: `${alias}.id`,
      fullName: `${alias}.fullName`,
      employeeCode: `${alias}.employeeCode`,
    }));
    return chain;
  });
}

function selectCallAt(db: { select: ReturnType<typeof vi.fn> }, index: number) {
  return db.select.mock.results[index].value as ReturnType<typeof createChainMock>;
}

beforeEach(async () => {
  vi.clearAllMocks();

  selectChain = createChainMock([]);
  insertChain = createChainMock([]);
  updateChain = createChainMock([]);
  deleteChain = createChainMock([]);

  const db = await getDb();
  db.select.mockReturnValue(selectChain);
  db.insert.mockReturnValue(insertChain);
  db.update.mockReturnValue(updateChain);
  db.delete.mockReturnValue(deleteChain);
});

describe('createCycle', () => {
  it('creates a cycle and writes audit log', async () => {
    const { createCycle } = await import('@/services/evaluation');

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'cycle-new' }]);

    const result = await createCycle(adminCtx, {
      name: '2026年上期',
      periodStart: '2026-04-01',
      periodEnd: '2026-09-30',
    });

    expect(result).toEqual({ success: true, data: { id: 'cycle-new' } });
    const db = await getDb();
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('throws AuthorizationError for member', async () => {
    const { createCycle } = await import('@/services/evaluation');

    await expect(
      createCycle(memberCtx, {
        name: '2026年上期',
        periodStart: '2026-04-01',
        periodEnd: '2026-09-30',
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for viewer', async () => {
    const { createCycle } = await import('@/services/evaluation');

    await expect(
      createCycle(viewerCtx, {
        name: '2026年上期',
        periodStart: '2026-04-01',
        periodEnd: '2026-09-30',
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('allows owner to create', async () => {
    const { createCycle } = await import('@/services/evaluation');

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'cycle-owner' }]);

    const result = await createCycle(ownerCtx, {
      name: '2026年下期',
      periodStart: '2026-10-01',
      periodEnd: '2027-03-31',
    });

    expect(result.success).toBe(true);
  });
});

describe('updateCycle', () => {
  it('updates a cycle with changes', async () => {
    const { updateCycle } = await import('@/services/evaluation');

    const current = {
      id: 'c1',
      orgId: 'org-1',
      name: 'Old Name',
      periodStart: '2026-04-01',
      periodEnd: '2026-09-30',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    const result = await updateCycle(adminCtx, {
      id: 'c1',
      name: 'New Name',
      periodStart: '2026-04-01',
      periodEnd: '2026-09-30',
      status: 'in_progress',
    });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.update).toHaveBeenCalled();
  });

  it('returns error when cycle not found', async () => {
    const { updateCycle } = await import('@/services/evaluation');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await updateCycle(adminCtx, {
      id: 'nonexistent',
      name: 'Test',
      periodStart: '2026-04-01',
      periodEnd: '2026-09-30',
      status: 'draft',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('throws AuthorizationError for member', async () => {
    const { updateCycle } = await import('@/services/evaluation');

    await expect(
      updateCycle(memberCtx, {
        id: 'c1',
        name: 'Test',
        periodStart: '2026-04-01',
        periodEnd: '2026-09-30',
        status: 'draft',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('deleteCycle', () => {
  it('deletes a cycle with no evaluations', async () => {
    const { deleteCycle } = await import('@/services/evaluation');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'c1', name: 'Test Cycle' }]).then(cb);
      return Promise.resolve([{ count: 0 }]).then(cb);
    });

    const result = await deleteCycle(adminCtx, 'c1');

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.delete).toHaveBeenCalled();
  });

  it('returns error when cycle has evaluations', async () => {
    const { deleteCycle } = await import('@/services/evaluation');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'c1', name: 'Test Cycle' }]).then(cb);
      return Promise.resolve([{ count: 3 }]).then(cb);
    });

    const result = await deleteCycle(adminCtx, 'c1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('3 件');
    }
  });

  it('returns error when cycle not found', async () => {
    const { deleteCycle } = await import('@/services/evaluation');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await deleteCycle(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('throws AuthorizationError for member', async () => {
    const { deleteCycle } = await import('@/services/evaluation');

    await expect(deleteCycle(memberCtx, 'c1')).rejects.toThrow(AuthorizationError);
  });
});

describe('createEvaluation', () => {
  it('creates an evaluation and writes audit log', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount <= 3) return Promise.resolve([{ id: `entity-${selectCount}` }]).then(cb);
      return Promise.resolve([]).then(cb);
    });
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'eval-new' }]);

    const result = await createEvaluation(adminCtx, {
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'e2',
    });

    expect(result).toEqual({ success: true, data: { id: 'eval-new' } });
    const db = await getDb();
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('returns error when cycle not found', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await createEvaluation(adminCtx, {
      cycleId: 'nonexistent',
      employeeId: 'e1',
      evaluatorId: 'e2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('評価サイクル');
    }
  });

  it('returns error when employee not found', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'c1' }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await createEvaluation(adminCtx, {
      cycleId: 'c1',
      employeeId: 'nonexistent',
      evaluatorId: 'e2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('対象従業員');
    }
  });

  it('returns error for duplicate evaluation', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'existing' }]).then(cb));

    const result = await createEvaluation(adminCtx, {
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'e2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('既に存在');
    }
  });

  it('throws AuthorizationError for viewer', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    await expect(
      createEvaluation(viewerCtx, {
        cycleId: 'c1',
        employeeId: 'e1',
        evaluatorId: 'e2',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('updateEvaluation', () => {
  it('updates ratings and comment', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const current = {
      id: 'ev1',
      orgId: 'org-1',
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'e2',
      ratings: null,
      comment: null,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    const result = await updateEvaluation(adminCtx, {
      id: 'ev1',
      ratings: { performance: 4, competency: 3 },
      comment: 'Good work',
      status: 'submitted',
    });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.update).toHaveBeenCalled();
  });

  it('returns error when evaluation not found', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await updateEvaluation(adminCtx, {
      id: 'nonexistent',
      ratings: { performance: 5 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('does nothing when no changes', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const current = {
      id: 'ev1',
      orgId: 'org-1',
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'e2',
      ratings: null,
      comment: null,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    const result = await updateEvaluation(adminCtx, {
      id: 'ev1',
    });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws AuthorizationError for viewer', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    await expect(
      updateEvaluation(viewerCtx, {
        id: 'ev1',
        ratings: { performance: 5 },
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('deleteEvaluation', () => {
  it('deletes an evaluation', async () => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'ev1' }]).then(cb));

    const result = await deleteEvaluation(adminCtx, 'ev1');

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.delete).toHaveBeenCalled();
  });

  it('returns error when evaluation not found', async () => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await deleteEvaluation(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('throws AuthorizationError for member', async () => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    await expect(deleteEvaluation(memberCtx, 'ev1')).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for viewer', async () => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    await expect(deleteEvaluation(viewerCtx, 'ev1')).rejects.toThrow(AuthorizationError);
  });
});

describe('listCycles', () => {
  it('自組織のサイクルを評価件数つきで返す', async () => {
    const { listCycles } = await import('@/services/evaluation');

    const rows = [
      {
        id: 'c1',
        name: '2026年上期',
        periodStart: '2026-04-01',
        periodEnd: '2026-09-30',
        status: 'in_progress',
        createdAt: new Date(),
        evaluationCount: 12,
      },
    ];

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([rows]));

    await expect(listCycles(adminCtx)).resolves.toEqual(rows);
  });

  it('サイクルが0件なら空配列を返す', async () => {
    // 空状態（EmptyState）の描画前提。
    const { listCycles } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[]]));

    await expect(listCycles(adminCtx)).resolves.toEqual([]);
  });

  it('org_id で絞り、期間開始の降順で並べる', async () => {
    // 評価は人事情報の中でも特に機微。org_id が抜けると他社の
    // 評価サイクルが一覧に混ざる。
    const { listCycles } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[]]));

    await listCycles(ctxOtherOrg);

    const chain = selectCallAt(db, 0);
    expect(collectParams(chain.where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('period_start desc');
  });

  it('viewer も閲覧できる', async () => {
    const { listCycles } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[]]));

    await expect(listCycles(viewerCtx)).resolves.toEqual([]);
  });
});

describe('getCycle', () => {
  const cycleRow = {
    id: 'c1',
    name: '2026年上期',
    periodStart: '2026-04-01',
    periodEnd: '2026-09-30',
    status: 'in_progress',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('サイクル本体と紐づく評価一覧を返す', async () => {
    const { getCycle } = await import('@/services/evaluation');

    const evalRows = [
      {
        id: 'ev1',
        cycleId: 'c1',
        employeeId: 'e1',
        employeeName: '山田太郎',
        employeeCode: 'EMP-001',
        evaluatorId: 'e2',
        evaluatorName: '鈴木花子',
        ratings: null,
        comment: null,
        status: 'draft',
        createdAt: new Date(),
      },
    ];

    const db = await getDb();
    // 0: サイクル本体 / 1,2: 従業員サブクエリ / 3: 評価一覧
    db.select.mockImplementation(createSelectSequence([[cycleRow], [], [], evalRows]));

    const result = await getCycle(adminCtx, 'c1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cycle).toEqual(cycleRow);
      expect(result.data.evaluations).toEqual(evalRows);
    }
  });

  it('サイクルが無ければ評価一覧を引かずにエラーを返す', async () => {
    const { getCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[]]));

    const result = await getCycle(adminCtx, 'missing');

    expect(result).toEqual({ success: false, error: '評価サイクルが見つかりません' });
    // 本体が無い時点で打ち切り、サブクエリすら組み立てないこと。
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('評価が0件でも空配列で成功を返す', async () => {
    // サイクル作成直後の状態。ここで壊れると詳細画面が開けない。
    const { getCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[cycleRow], [], [], []]));

    const result = await getCycle(adminCtx, 'c1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evaluations).toEqual([]);
    }
  });

  it('サイクル本体・評価一覧の双方を org_id で絞る', async () => {
    // 他テナントのサイクル ID を URL に入れても中身が見えないこと。
    const { getCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[cycleRow], [], [], []]));

    await getCycle(ctxOtherOrg, 'c1');

    const cycleParams = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(cycleParams).toContainEqual({ column: 'id', value: 'c1' });
    expect(cycleParams).toContainEqual({ column: 'org_id', value: 'org-2' });

    const evalParams = collectParams(selectCallAt(db, 3).where.mock.calls[0][0]);
    expect(evalParams).toContainEqual({ column: 'cycle_id', value: 'c1' });
    expect(evalParams).toContainEqual({ column: 'org_id', value: 'org-2' });
  });

  it('viewer も閲覧できる', async () => {
    const { getCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[cycleRow], [], [], []]));

    await expect(getCycle(viewerCtx, 'c1')).resolves.toMatchObject({ success: true });
  });
});

describe('createCycle — 監査ログとテナント分離', () => {
  it('org_id 付きで INSERT し、監査ログを残す', async () => {
    const { createCycle } = await import('@/services/evaluation');

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'cycle-new' }]);

    await createCycle(adminCtx, {
      name: '2026年上期',
      periodStart: '2026-04-01',
      periodEnd: '2026-09-30',
    });

    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      name: '2026年上期',
      periodStart: '2026-04-01',
      periodEnd: '2026-09-30',
    });

    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      orgId: 'org-1',
      actorUserId: 'user-2',
      action: 'evaluation_cycle.create',
      resourceType: 'evaluation_cycle',
      resourceId: 'cycle-new',
      changes: {
        name: '2026年上期',
        periodStart: '2026-04-01',
        periodEnd: '2026-09-30',
      },
    });
  });

  it.each(rolesBelow('admin'))('%s ロールはサイクルを作成できない', async (role) => {
    const { createCycle } = await import('@/services/evaluation');

    await expect(
      createCycle(CTX_BY_ROLE[role], {
        name: '2026年上期',
        periodStart: '2026-04-01',
        periodEnd: '2026-09-30',
      }),
    ).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('updateCycle — 差分検出', () => {
  const current = {
    id: 'c1',
    orgId: 'org-1',
    name: '2026年上期',
    periodStart: '2026-04-01',
    periodEnd: '2026-09-30',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sameInput = {
    id: 'c1',
    name: '2026年上期',
    periodStart: '2026-04-01',
    periodEnd: '2026-09-30',
    status: 'draft' as const,
  };

  it('変更が無いときは UPDATE も監査ログも実行しない', async () => {
    // 「保存」連打で監査ログがノイズで埋まるのを防ぐ。
    const { updateCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    const result = await updateCycle(adminCtx, sameInput);

    expect(result).toEqual({ success: true, data: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('変更したフィールドだけが差分として監査ログに残る', async () => {
    const { updateCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await updateCycle(adminCtx, { ...sameInput, status: 'in_progress' });

    const changes = (insertChain.values.mock.calls[0][0] as { changes: Record<string, unknown> })
      .changes;
    expect(changes).toEqual({ status: { from: 'draft', to: 'in_progress' } });
    expect(changes).not.toHaveProperty('name');
  });

  it('期間の変更も差分に載る', async () => {
    const { updateCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await updateCycle(adminCtx, {
      ...sameInput,
      periodStart: '2026-04-15',
      periodEnd: '2026-10-15',
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: {
        periodStart: { from: '2026-04-01', to: '2026-04-15' },
        periodEnd: { from: '2026-09-30', to: '2026-10-15' },
      },
    });
  });

  it('取得・更新の双方に id と org_id を付ける', async () => {
    const { updateCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await updateCycle(adminCtx, { ...sameInput, name: '2026年上期(改)' });

    const selectParams = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(selectParams).toContainEqual({ column: 'id', value: 'c1' });
    expect(selectParams).toContainEqual({ column: 'org_id', value: 'org-1' });

    const updateParams = collectParams(updateChain.where.mock.calls[0][0]);
    expect(updateParams).toContainEqual({ column: 'id', value: 'c1' });
    expect(updateParams).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it.each(rolesAtLeast('admin'))('%s ロールはサイクルを更新できる', async (role) => {
    const { updateCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await expect(
      updateCycle(CTX_BY_ROLE[role], { ...sameInput, name: '新名称' }),
    ).resolves.toMatchObject({ success: true });
  });
});

describe('deleteCycle — 削除ガードと監査ログ', () => {
  it('紐づく評価が無ければ DELETE し、監査ログを残す', async () => {
    const { deleteCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1', name: '2026年上期' }], [{ count: 0 }]]),
    );

    await deleteCycle(adminCtx, 'c1');

    const params = collectParams(deleteChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'c1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'evaluation_cycle.delete',
      resourceType: 'evaluation_cycle',
      resourceId: 'c1',
      changes: { name: '2026年上期' },
    });
  });

  it('評価件数の確認も org_id 込みで行う', async () => {
    // org_id が無いと他テナントの評価まで数え、削除できるはずの
    // サイクルが永久に削除できなくなる。
    const { deleteCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1', name: '2026年上期' }], [{ count: 0 }]]),
    );

    await deleteCycle(adminCtx, 'c1');

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'cycle_id', value: 'c1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('紐づく評価がある場合は DELETE も監査ログも実行しない', async () => {
    const { deleteCycle } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1', name: '2026年上期' }], [{ count: 5 }]]),
    );

    const result = await deleteCycle(adminCtx, 'c1');

    expect(result).toEqual({
      success: false,
      error: 'この評価サイクルには 5 件の評価が紐づいているため削除できません',
    });
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('createEvaluation — 存在確認の順序', () => {
  it('評価者が見つからない場合はエラーを返し INSERT しない', async () => {
    // サイクル・対象者は実在するが評価者だけ他テナント／退職済みのケース。
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[{ id: 'c1' }], [{ id: 'e1' }], []]));

    const result = await createEvaluation(adminCtx, {
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'ghost',
    });

    expect(result).toEqual({ success: false, error: '評価者が見つかりません' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('サイクル・対象者・評価者の存在確認はすべて org_id 込みで行う', async () => {
    // org_id が無いと、他テナントの従業員 ID を評価者に指定でき、
    // テナントをまたいだ評価レコードが作れてしまう。
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1' }], [{ id: 'e1' }], [{ id: 'e2' }], []]),
    );
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'eval-new' }]);

    await createEvaluation(adminCtx, { cycleId: 'c1', employeeId: 'e1', evaluatorId: 'e2' });

    for (const index of [0, 1, 2]) {
      expect(collectParams(selectCallAt(db, index).where.mock.calls[0][0])).toContainEqual({
        column: 'org_id',
        value: 'org-1',
      });
    }
  });

  it('org_id 付きで INSERT し、監査ログを残す', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1' }], [{ id: 'e1' }], [{ id: 'e2' }], []]),
    );
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'eval-new' }]);

    await createEvaluation(adminCtx, { cycleId: 'c1', employeeId: 'e1', evaluatorId: 'e2' });

    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'e2',
    });
    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      action: 'evaluation.create',
      resourceType: 'evaluation',
      resourceId: 'eval-new',
      changes: { cycleId: 'c1', employeeId: 'e1', evaluatorId: 'e2' },
    });
  });

  it('重複判定は org_id・サイクル・対象者・評価者の4条件で行う', async () => {
    // 同一サイクル内で同じ評価者から2重登録されると、
    // 集計が二重計上される。
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1' }], [{ id: 'e1' }], [{ id: 'e2' }], []]),
    );
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'eval-new' }]);

    await createEvaluation(adminCtx, { cycleId: 'c1', employeeId: 'e1', evaluatorId: 'e2' });

    const params = collectParams(selectCallAt(db, 3).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'cycle_id', value: 'c1' });
    expect(params).toContainEqual({ column: 'employee_id', value: 'e1' });
    expect(params).toContainEqual({ column: 'evaluator_id', value: 'e2' });
  });

  it.each(rolesAtLeast('admin'))('%s ロールは誰の評価でも作成できる', async (role) => {
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'c1' }], [{ id: 'e1' }], [{ id: 'e2' }], []]),
    );
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'eval-new' }]);

    await expect(
      createEvaluation(CTX_BY_ROLE[role], { cycleId: 'c1', employeeId: 'e1', evaluatorId: 'e2' }),
    ).resolves.toMatchObject({ success: true });
  });

  /**
   * member は自分が評価者の評価だけ作成できる。
   * ここを開けると、自分が評価者でない評価を勝手に起票できてしまう。
   *
   * 「自分」の判定は employees.user_id との突き合わせで行う
   * （src/services/self.ts）。紐付いていない member は作成できない。
   */
  it('member は自分が評価者なら作成できる', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    // 1回目: 自分の従業員レコード解決 / 以降: サイクル・従業員・評価者・重複
    db.select.mockImplementation(
      createSelectSequence([[{ id: 'me' }], [{ id: 'c1' }], [{ id: 'e1' }], [{ id: 'me' }], []]),
    );
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'eval-new' }]);

    await expect(
      createEvaluation(memberCtx, { cycleId: 'c1', employeeId: 'e1', evaluatorId: 'me' }),
    ).resolves.toMatchObject({ success: true });
  });

  it('member は自分が評価者でない評価を作成できない', async () => {
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[{ id: 'me' }]]));

    const result = await createEvaluation(memberCtx, {
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'someone-else',
    });

    expect(result).toEqual({ success: false, error: '自分が評価者の評価のみ作成できます' });
    expect(insertChain.values).not.toHaveBeenCalled();
  });

  it('従業員レコードに紐付いていない member は作成できない', async () => {
    // メール未登録などで紐付かない場合は安全側に倒す。
    const { createEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[]]));

    const result = await createEvaluation(memberCtx, {
      cycleId: 'c1',
      employeeId: 'e1',
      evaluatorId: 'me',
    });

    expect(result.success).toBe(false);
    expect(insertChain.values).not.toHaveBeenCalled();
  });
});

describe('updateEvaluation — 差分更新の詳細', () => {
  const current = {
    id: 'ev1',
    orgId: 'org-1',
    cycleId: 'c1',
    employeeId: 'e1',
    evaluatorId: 'e2',
    ratings: null,
    comment: 'これまでのコメント',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('コメントに空文字を渡すと null 化され、差分に載る', async () => {
    // 空文字のまま保存すると「コメント未記入」と区別できなくなる。
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await updateEvaluation(adminCtx, { id: 'ev1', comment: '' });

    expect((updateChain.set.mock.calls[0][0] as Record<string, unknown>).comment).toBeNull();
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'evaluation.update',
      resourceId: 'ev1',
      changes: { comment: { from: 'これまでのコメント', to: null } },
    });
  });

  it('同じコメントを渡したときは差分にも set にも含めない', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    const result = await updateEvaluation(adminCtx, {
      id: 'ev1',
      comment: 'これまでのコメント',
    });

    expect(result).toEqual({ success: true, data: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('status が同じ場合は差分に含めない', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await updateEvaluation(adminCtx, { id: 'ev1', comment: '新コメント', status: 'draft' });

    const changes = (insertChain.values.mock.calls[0][0] as { changes: Record<string, unknown> })
      .changes;
    expect(changes).toHaveProperty('comment');
    expect(changes).not.toHaveProperty('status');
  });

  it('ratings は同じ値でも常に差分として扱う（JSON の等値比較をしないため）', async () => {
    // ratings は JSON。参照比較では差分判定できないため、
    // 渡されたら必ず更新する仕様であることを固定する。
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(
      createSelectSequence([[{ ...current, ratings: { performance: 4 } }]]),
    );

    await updateEvaluation(adminCtx, { id: 'ev1', ratings: { performance: 4 } });

    expect(db.update).toHaveBeenCalled();
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: { ratings: { from: { performance: 4 }, to: { performance: 4 } } },
    });
  });

  it('取得・更新の双方に id と org_id を付ける', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await updateEvaluation(adminCtx, { id: 'ev1', status: 'submitted' });

    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
    const updateParams = collectParams(updateChain.where.mock.calls[0][0]);
    expect(updateParams).toContainEqual({ column: 'id', value: 'ev1' });
    expect(updateParams).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it.each(rolesAtLeast('admin'))('%s ロールは誰の評価でも更新できる', async (role) => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current]]));

    await expect(
      updateEvaluation(CTX_BY_ROLE[role], { id: 'ev1', status: 'submitted' }),
    ).resolves.toMatchObject({ success: true });
  });

  /**
   * 被評価者本人が自分の評価点やコメントを書き換えられないようにする。
   * 評価の完全性に直結する。
   */
  it('member は自分が評価者の評価を更新できる', async () => {
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    // 1回目: 現在の評価 / 2回目: 自分の従業員レコード
    db.select.mockImplementation(createSelectSequence([[current], [{ id: 'e2' }]]));

    await expect(
      updateEvaluation(memberCtx, { id: 'ev1', status: 'submitted' }),
    ).resolves.toMatchObject({ success: true });
  });

  it('member は自分が評価者でない評価を更新できない', async () => {
    // current.evaluatorId は 'e2'。被評価者 'e1' 本人として更新を試みる。
    const { updateEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[current], [{ id: 'e1' }]]));

    const result = await updateEvaluation(memberCtx, { id: 'ev1', ratings: { q1: 5 } });

    expect(result).toEqual({ success: false, error: '自分が評価者の評価のみ編集できます' });
    expect(updateChain.set).not.toHaveBeenCalled();
  });
});

describe('deleteEvaluation — 監査ログとテナント分離', () => {
  it('DELETE 文に id と org_id を付け、changes なしで監査ログを残す', async () => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[{ id: 'ev1' }]]));

    await deleteEvaluation(adminCtx, 'ev1');

    const params = collectParams(deleteChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'ev1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'evaluation.delete',
      resourceType: 'evaluation',
      resourceId: 'ev1',
      changes: null,
    });
  });

  it('他テナントの ID を渡しても取得段階で弾かれる', async () => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[]]));

    const result = await deleteEvaluation(ctxOtherOrg, 'ev1');

    expect(result.success).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールは評価を削除できる', async (role) => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    const db = await getDb();
    db.select.mockImplementation(createSelectSequence([[{ id: 'ev1' }]]));

    await expect(deleteEvaluation(CTX_BY_ROLE[role], 'ev1')).resolves.toMatchObject({
      success: true,
    });
  });

  it.each(rolesBelow('admin'))('%s ロールは評価を削除できない', async (role) => {
    const { deleteEvaluation } = await import('@/services/evaluation');

    await expect(deleteEvaluation(CTX_BY_ROLE[role], 'ev1')).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.delete).not.toHaveBeenCalled();
  });
});
