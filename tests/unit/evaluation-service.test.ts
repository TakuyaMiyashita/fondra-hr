import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

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
