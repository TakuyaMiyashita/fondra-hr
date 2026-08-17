import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const viewerCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'viewer' };

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const resolve = () => Promise.resolve(resolvedValue);

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);

  chain.then = vi.fn().mockImplementation((onFulfilled) => resolve().then(onFulfilled));

  return chain;
}

let selectChain: ReturnType<typeof createChainMock>;

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
});
