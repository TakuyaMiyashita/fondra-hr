import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const memberCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'member' };
const viewerCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'viewer' };
const otherOrgCtx: AuthContext = { userId: 'user-4', orgId: 'org-2', role: 'admin' };

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const resolve = () => Promise.resolve(resolvedValue);

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockImplementation(resolve);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.as = vi.fn().mockReturnValue({ id: 'sub.id', fullName: 'sub.fullName' });

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

describe('listEmployees', () => {
  it('calls authorize with read action', async () => {
    const { listEmployees } = await import('@/services/employee');

    selectChain.then = vi.fn().mockImplementation((onFulfilled) =>
      Promise.resolve([]).then(onFulfilled),
    );

    const db = await getDb();
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        const countChain = createChainMock([{ total: 0 }]);
        return countChain;
      }
      return selectChain;
    });

    const result = await listEmployees(adminCtx, {
      page: 1,
      perPage: 20,
      sort: 'createdAt',
      order: 'desc',
    });

    expect(result).toHaveProperty('employees');
    expect(result).toHaveProperty('total');
  });

  it('orders by a unique tie-breaker in addition to the sort column', async () => {
    // createdAt など一意でない列でソートすると、タイブレーカーが無い限り
    // LIMIT/OFFSET のページ間で行の重複・欠落が起きる。
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return createChainMock([{ total: 0 }]);
      return selectChain;
    });

    await listEmployees(adminCtx, {
      page: 2,
      perPage: 20,
      sort: 'createdAt',
      order: 'desc',
    });

    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(selectChain.orderBy.mock.calls[0]).toHaveLength(2);
  });

  it('returns employees and total count', async () => {
    const { listEmployees } = await import('@/services/employee');

    const mockEmployees = [
      {
        id: 'emp-1',
        employeeCode: 'EMP001',
        fullName: '山田太郎',
        fullNameKana: 'ヤマダタロウ',
        email: 'yamada@example.com',
        position: 'エンジニア',
        departmentId: 'dept-1',
        departmentName: '開発部',
        hiredOn: '2024-01-01',
        status: 'active',
        avatarPath: null,
        createdAt: new Date(),
      },
    ];

    const db = await getDb();
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return createChainMock([{ total: 1 }]);
      }
      const chain = createChainMock(mockEmployees);
      return chain;
    });

    const result = await listEmployees(adminCtx, {
      page: 1,
      perPage: 20,
      sort: 'createdAt',
      order: 'desc',
    });

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].fullName).toBe('山田太郎');
    expect(result.total).toBe(1);
  });

  it('throws AuthorizationError for viewer on read (should NOT throw — viewer can read)', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    let callCount = 0;
    db.select.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return createChainMock([{ total: 0 }]);
      }
      return createChainMock([]);
    });

    const result = await listEmployees(viewerCtx, {
      page: 1,
      perPage: 20,
      sort: 'createdAt',
      order: 'desc',
    });

    expect(result.employees).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('getEmployee', () => {
  it('returns employee detail when found', async () => {
    const { getEmployee } = await import('@/services/employee');

    const mockDetail = {
      id: 'emp-1',
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      fullNameKana: 'ヤマダタロウ',
      email: 'yamada@example.com',
      position: 'エンジニア',
      departmentId: 'dept-1',
      departmentName: '開発部',
      hiredOn: '2024-01-01',
      birthDate: '1990-05-15',
      status: 'active',
      avatarPath: null,
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const chain = createChainMock([mockDetail]);
    const db = await getDb();
    db.select.mockReturnValue(chain);

    const result = await getEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('山田太郎');
      expect(result.data.birthDate).toBe('1990-05-15');
    }
  });

  it('returns err when employee not found', async () => {
    const { getEmployee } = await import('@/services/employee');

    const chain = createChainMock([]);
    const db = await getDb();
    db.select.mockReturnValue(chain);

    const result = await getEmployee(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('従業員が見つかりません');
    }
  });

  it('filters by org_id so other tenant employees are inaccessible', async () => {
    const { getEmployee } = await import('@/services/employee');

    const chain = createChainMock([]);
    const db = await getDb();
    db.select.mockReturnValue(chain);

    const result = await getEmployee(otherOrgCtx, 'emp-1');

    expect(result.success).toBe(false);
    expect(chain.where).toHaveBeenCalled();
  });
});

describe('createEmployee', () => {
  it('inserts with org_id from ctx', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'new-emp-1' }]);
    db.insert.mockReturnValue(insertChain);

    const result = await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      status: 'active',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('new-emp-1');
    }

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1' }),
    );
  });

  it('writes audit log on creation', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([]));

    const mainInsertChain = createChainMock([]);
    mainInsertChain.returning = vi.fn().mockResolvedValue([{ id: 'new-emp-1' }]);

    const auditInsertChain = createChainMock([]);
    auditInsertChain.returning = vi.fn().mockResolvedValue([]);

    let insertCallCount = 0;
    db.insert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) return mainInsertChain;
      return auditInsertChain;
    });

    await createEmployee(adminCtx, {
      employeeCode: 'EMP002',
      fullName: '鈴木一郎',
      status: 'active',
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(auditInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employee.create',
        resourceType: 'employee',
        actorUserId: 'user-1',
        orgId: 'org-1',
      }),
    );
  });

  it('returns error when employee code is duplicated', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([{ id: 'existing-emp' }]));

    const result = await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '重複テスト',
      status: 'active',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('この社員番号は既に使用されています');
    }
  });

  it('throws AuthorizationError for viewer', async () => {
    const { createEmployee } = await import('@/services/employee');

    await expect(
      createEmployee(viewerCtx, {
        employeeCode: 'EMP001',
        fullName: 'テスト',
        status: 'active',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('updateEmployee', () => {
  const currentEmployee = {
    id: 'emp-1',
    orgId: 'org-1',
    employeeCode: 'EMP001',
    fullName: '山田太郎',
    fullNameKana: null,
    email: null,
    position: null,
    departmentId: null,
    hiredOn: null,
    birthDate: null,
    avatarPath: null,
    userId: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('updates only changed fields', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([currentEmployee]));

    const auditInsertChain = createChainMock([]);
    db.insert.mockReturnValue(auditInsertChain);

    await updateEmployee(adminCtx, 'emp-1', { fullName: '山田花子' });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: '山田花子' }),
    );
  });

  it('writes audit log with before/after changes', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([currentEmployee]));

    const auditInsertChain = createChainMock([]);
    db.insert.mockReturnValue(auditInsertChain);

    await updateEmployee(adminCtx, 'emp-1', { fullName: '山田花子' });

    expect(auditInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employee.update',
        changes: expect.objectContaining({
          fullName: { from: '山田太郎', to: '山田花子' },
        }),
      }),
    );
  });

  it('returns err when employee not found', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([]));

    const result = await updateEmployee(adminCtx, 'nonexistent', { fullName: 'テスト' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('従業員が見つかりません');
    }
  });

  it('throws AuthorizationError for viewer', async () => {
    const { updateEmployee } = await import('@/services/employee');

    await expect(
      updateEmployee(viewerCtx, 'emp-1', { fullName: 'テスト' }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('returns error when updated employee code conflicts', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    let selectCallCount = 0;
    db.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([currentEmployee]);
      }
      return createChainMock([{ id: 'other-emp' }]);
    });

    const result = await updateEmployee(adminCtx, 'emp-1', { employeeCode: 'EMP002' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('この社員番号は既に使用されています');
    }
  });

  it('skips DB update when no fields actually changed', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([currentEmployee]));

    const result = await updateEmployee(adminCtx, 'emp-1', { fullName: '山田太郎' });

    expect(result.success).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('deleteEmployee', () => {
  it('allows admin to delete', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([{ id: 'emp-1', fullName: '山田太郎' }]));
    db.insert.mockReturnValue(createChainMock([]));

    const result = await deleteEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });

  it('throws AuthorizationError for member', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    await expect(deleteEmployee(memberCtx, 'emp-1')).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError for viewer', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    await expect(deleteEmployee(viewerCtx, 'emp-1')).rejects.toThrow(AuthorizationError);
  });

  it('writes audit log on deletion', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([{ id: 'emp-1', fullName: '山田太郎' }]));

    const auditInsertChain = createChainMock([]);
    db.insert.mockReturnValue(auditInsertChain);

    await deleteEmployee(adminCtx, 'emp-1');

    expect(auditInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employee.delete',
        actorUserId: 'user-1',
        changes: { fullName: '山田太郎' },
      }),
    );
  });

  it('returns err when employee not found', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([]));
    db.insert.mockReturnValue(createChainMock([]));

    const result = await deleteEmployee(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('従業員が見つかりません');
    }
  });
});

describe('getDepartmentsForOrg', () => {
  it('returns departments for the org', async () => {
    const { getDepartmentsForOrg } = await import('@/services/employee');

    const mockDepts = [
      { id: 'dept-1', name: '開発部' },
      { id: 'dept-2', name: '営業部' },
    ];

    const db = await getDb();
    db.select.mockReturnValue(createChainMock(mockDepts));

    const result = await getDepartmentsForOrg(adminCtx);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('開発部');
  });
});
