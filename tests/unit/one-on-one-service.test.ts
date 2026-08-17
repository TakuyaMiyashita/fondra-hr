import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const viewerCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'viewer' };

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

describe('createOneOnOne', () => {
  it('creates a record and writes audit log', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount <= 2) return Promise.resolve([{ id: `e${selectCount}` }]).then(cb);
      return Promise.resolve([]).then(cb);
    });
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'oo-new' }]);

    const result = await createOneOnOne(adminCtx, {
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'テストメモ',
      moodScore: 4,
    });

    expect(result).toEqual({ success: true, data: { id: 'oo-new' } });
    const db = await getDb();
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('returns error when employee not found', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await createOneOnOne(adminCtx, {
      employeeId: 'nonexistent',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('対象従業員');
    }
  });

  it('returns error when interviewer not found', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'e1' }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await createOneOnOne(adminCtx, {
      employeeId: 'e1',
      interviewerId: 'nonexistent',
      heldOn: '2026-08-01',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('面談者');
    }
  });

  it('throws AuthorizationError for viewer', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    await expect(
      createOneOnOne(viewerCtx, {
        employeeId: 'e1',
        interviewerId: 'e2',
        heldOn: '2026-08-01',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('updateOneOnOne', () => {
  it('updates a record with changes', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    const current = {
      id: 'oo1',
      orgId: 'org-1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'old notes',
      aiSummary: null,
      moodScore: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    const result = await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'updated notes',
      moodScore: 4,
    });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.update).toHaveBeenCalled();
  });

  it('returns error when record not found', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await updateOneOnOne(adminCtx, {
      id: 'nonexistent',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });
});

describe('deleteOneOnOne', () => {
  it('deletes a record', async () => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'oo1' }]).then(cb));

    const result = await deleteOneOnOne(adminCtx, 'oo1');

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.delete).toHaveBeenCalled();
  });

  it('returns error when record not found', async () => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await deleteOneOnOne(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('throws AuthorizationError for viewer', async () => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    await expect(deleteOneOnOne(viewerCtx, 'oo1')).rejects.toThrow(AuthorizationError);
  });
});

describe('getEmployeesForOrg', () => {
  it('returns active employees', async () => {
    const { getEmployeesForOrg } = await import('@/services/one-on-one');

    const emps = [{ id: 'e1', fullName: '田中太郎', employeeCode: 'EMP-001' }];
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve(emps).then(cb));

    const result = await getEmployeesForOrg(adminCtx);

    expect(result).toEqual(emps);
  });
});
