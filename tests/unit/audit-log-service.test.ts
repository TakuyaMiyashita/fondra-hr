import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const memberCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'member' };
const viewerCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'viewer' };

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const resolve = () => Promise.resolve(resolvedValue);

  chain.select = vi.fn().mockReturnValue(chain);
  chain.selectDistinct = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.as = vi.fn().mockReturnValue(chain);

  chain.then = vi.fn().mockImplementation((onFulfilled) => resolve().then(onFulfilled));

  return chain;
}

let selectChain: ReturnType<typeof createChainMock>;

vi.mock('@/db', () => {
  const mockDb = {
    select: vi.fn(),
    selectDistinct: vi.fn(),
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
    selectDistinct: ReturnType<typeof vi.fn>;
  };
}

beforeEach(async () => {
  vi.clearAllMocks();

  selectChain = createChainMock([]);

  const db = await getDb();
  db.select.mockReturnValue(selectChain);
  db.selectDistinct.mockReturnValue(selectChain);
});

describe('listAuditLogs', () => {
  it('returns logs with pagination', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ count: 25 }]).then(cb);
      return Promise.resolve([
        {
          id: 'log-1',
          actorEmail: 'user@example.com',
          action: 'employee.create',
          resourceType: 'employee',
          resourceId: 'emp-1',
          changes: { name: 'Test' },
          createdAt: new Date(),
        },
      ]).then(cb);
    });

    const result = await listAuditLogs(adminCtx, {
      page: 1,
      perPage: 20,
      order: 'desc',
    });

    expect(result.total).toBe(25);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe('employee.create');
  });

  it('filters by resourceType', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ count: 5 }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await listAuditLogs(adminCtx, {
      page: 1,
      perPage: 20,
      order: 'desc',
      resourceType: 'employee',
    });

    expect(result.total).toBe(5);
  });

  it('allows viewer to read audit logs', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ count: 0 }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await listAuditLogs(viewerCtx, {
      page: 1,
      perPage: 20,
      order: 'desc',
    });

    expect(result.total).toBe(0);
    expect(result.logs).toEqual([]);
  });

  it('allows member to read audit logs', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ count: 0 }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await listAuditLogs(memberCtx, {
      page: 1,
      perPage: 20,
      order: 'desc',
    });

    expect(result.total).toBe(0);
  });
});

describe('getResourceTypes', () => {
  it('returns distinct resource types', async () => {
    const { getResourceTypes } = await import('@/services/audit-log');

    selectChain.then = vi.fn().mockImplementation((cb) =>
      Promise.resolve([
        { resourceType: 'department' },
        { resourceType: 'employee' },
        { resourceType: 'skill' },
      ]).then(cb),
    );

    const result = await getResourceTypes(adminCtx);

    expect(result).toEqual(['department', 'employee', 'skill']);
  });

  it('returns empty array when no logs', async () => {
    const { getResourceTypes } = await import('@/services/audit-log');

    selectChain.then = vi.fn().mockImplementation((cb) =>
      Promise.resolve([]).then(cb),
    );

    const result = await getResourceTypes(adminCtx);

    expect(result).toEqual([]);
  });
});
