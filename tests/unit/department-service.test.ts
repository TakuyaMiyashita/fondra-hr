import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const memberCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'member' };
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

describe('listDepartments', () => {
  it('returns departments for the organization', async () => {
    const { listDepartments } = await import('@/services/department');

    const depts = [
      { id: 'd1', name: '営業部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'd2', name: '開発部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve(depts).then(cb));

    const result = await listDepartments(viewerCtx);
    expect(result).toEqual(depts);
  });
});

describe('getDepartmentTree', () => {
  it('builds tree structure from flat departments', async () => {
    const { getDepartmentTree } = await import('@/services/department');

    const depts = [
      { id: 'd1', name: '営業部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'd2', name: '営業1課', parentId: 'd1', createdAt: new Date(), updatedAt: new Date() },
    ];
    const empCounts = [
      { departmentId: 'd1', count: 3 },
      { departmentId: 'd2', count: 5 },
    ];

    const db = await getDb();
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createChainMock(depts);
      return createChainMock(empCounts);
    });

    const tree = await getDepartmentTree(viewerCtx);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('営業部');
    expect(tree[0].employeeCount).toBe(3);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('営業1課');
    expect(tree[0].children[0].employeeCount).toBe(5);
  });
});

describe('getDepartment', () => {
  it('returns a single department', async () => {
    const { getDepartment } = await import('@/services/department');

    const dept = {
      id: 'd1',
      name: '営業部',
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([dept]).then(cb));

    const result = await getDepartment(viewerCtx, 'd1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('営業部');
    }
  });

  it('returns error when department not found', async () => {
    const { getDepartment } = await import('@/services/department');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await getDepartment(viewerCtx, 'nonexistent');
    expect(result.success).toBe(false);
  });
});

describe('createDepartment', () => {
  it('creates a department as admin', async () => {
    const { createDepartment } = await import('@/services/department');

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'new-id' }]);
    insertChain.values = vi.fn().mockReturnValue(insertChain);

    const result = await createDepartment(adminCtx, { name: '新部署' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('new-id');
    }
  });

  it('rejects member role', async () => {
    const { createDepartment } = await import('@/services/department');
    await expect(createDepartment(memberCtx, { name: '新部署' })).rejects.toThrow(
      AuthorizationError,
    );
  });

  it('rejects viewer role', async () => {
    const { createDepartment } = await import('@/services/department');
    await expect(createDepartment(viewerCtx, { name: '新部署' })).rejects.toThrow(
      AuthorizationError,
    );
  });

  it('validates parent department exists', async () => {
    const { createDepartment } = await import('@/services/department');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await createDepartment(adminCtx, {
      name: '新部署',
      parentId: 'nonexistent-parent',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('親部署');
    }
  });
});

describe('updateDepartment', () => {
  it('updates department name', async () => {
    const { updateDepartment } = await import('@/services/department');

    const existing = {
      id: 'd1',
      name: '旧名',
      parentId: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([existing]).then(cb));

    const result = await updateDepartment(adminCtx, 'd1', { name: '新名' });
    expect(result.success).toBe(true);
  });

  it('rejects self-reference as parent', async () => {
    const { updateDepartment } = await import('@/services/department');

    const existing = {
      id: 'd1',
      name: '部署',
      parentId: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([existing]).then(cb));

    const result = await updateDepartment(adminCtx, 'd1', { parentId: 'd1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('自分自身');
    }
  });

  it('returns ok when no changes', async () => {
    const { updateDepartment } = await import('@/services/department');

    const existing = {
      id: 'd1',
      name: '部署',
      parentId: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([existing]).then(cb));

    const result = await updateDepartment(adminCtx, 'd1', { name: '部署' });
    expect(result.success).toBe(true);
  });

  it('rejects when department not found', async () => {
    const { updateDepartment } = await import('@/services/department');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await updateDepartment(adminCtx, 'missing', { name: '新名' });
    expect(result.success).toBe(false);
  });
});

describe('deleteDepartment', () => {
  it('deletes department without children or employees', async () => {
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    let selectCallCount = 0;
    db.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([{ id: 'd1', name: '部署' }]);
      }
      if (selectCallCount === 2) {
        return createChainMock([{ count: 0 }]);
      }
      return createChainMock([{ count: 0 }]);
    });

    const result = await deleteDepartment(adminCtx, 'd1');
    expect(result.success).toBe(true);
  });

  it('rejects deletion when children exist', async () => {
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    let selectCallCount = 0;
    db.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([{ id: 'd1', name: '部署' }]);
      }
      return createChainMock([{ count: 2 }]);
    });

    const result = await deleteDepartment(adminCtx, 'd1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('子部署');
    }
  });

  it('rejects deletion when employees exist', async () => {
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    let selectCallCount = 0;
    db.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([{ id: 'd1', name: '部署' }]);
      }
      if (selectCallCount === 2) {
        return createChainMock([{ count: 0 }]);
      }
      return createChainMock([{ count: 3 }]);
    });

    const result = await deleteDepartment(adminCtx, 'd1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('従業員');
    }
  });

  it('rejects when department not found', async () => {
    const { deleteDepartment } = await import('@/services/department');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await deleteDepartment(adminCtx, 'missing');
    expect(result.success).toBe(false);
  });

  it('rejects member role', async () => {
    const { deleteDepartment } = await import('@/services/department');
    await expect(deleteDepartment(memberCtx, 'd1')).rejects.toThrow(AuthorizationError);
  });
});
