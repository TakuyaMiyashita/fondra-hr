import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

import { CTX_BY_ROLE, ctxOtherOrg, rolesAtLeast, rolesBelow } from '../helpers/auth-fixtures';
import { type ChainMock, createSequentialSelect } from '../helpers/db-mock';

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

/** drizzle の SQL 式に束縛された値を全て取り出す（カラム名を持たない値も含む）。 */
function collectValues(node: unknown, acc: unknown[] = []): unknown[] {
  // 生の文字列は Param に包まれず queryChunks に直接入る（ilike のパターン等）。
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (!node || typeof node !== 'object') return acc;
  const n = node as Record<string, unknown>;
  if (n.encoder) acc.push(n.value);
  if (Array.isArray(n.queryChunks)) {
    for (const chunk of n.queryChunks) collectValues(chunk, acc);
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

function selectCallAt(db: { select: ReturnType<typeof vi.fn> }, index: number) {
  return db.select.mock.results[index].value as ChainMock;
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

    selectChain.then = vi
      .fn()
      .mockImplementation((onFulfilled) => Promise.resolve([]).then(onFulfilled));

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

    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1' }));
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

    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ fullName: '山田花子' }));
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

    await expect(updateEmployee(viewerCtx, 'emp-1', { fullName: 'テスト' })).rejects.toThrow(
      AuthorizationError,
    );
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

/**
 * `deleteEmployee` は3回 select する。対象の存在確認 → 評価の件数 → 1on1 の件数。
 * まとめて同じ値を返すモックにすると、件数が undefined のまま
 * 「参照ゼロだから消せる」を通ってしまい、ガードを検証したことにならない。
 */
function deleteSelects(target: unknown[], evaluations = 0, oneOnOnes = 0) {
  return createSequentialSelect([target, [{ count: evaluations }], [{ count: oneOnOnes }]]);
}

describe('deleteEmployee', () => {
  it('allows admin to delete', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select = deleteSelects([{ id: 'emp-1', fullName: '山田太郎' }]);
    db.insert.mockReturnValue(createChainMock([]));

    const result = await deleteEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });

  it('refuses to delete when evaluations reference the employee', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select = deleteSelects([{ id: 'emp-1', fullName: '山田太郎' }], 20, 0);
    db.insert.mockReturnValue(createChainMock([]));

    const result = await deleteEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('評価20件');
      expect(result.error).toContain('匿名化');
    }
    // 消さずに止まること。ここが通ると他人が書いた評価まで道連れになる。
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete when one-on-ones reference the employee', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select = deleteSelects([{ id: 'emp-1', fullName: '山田太郎' }], 0, 38);
    db.insert.mockReturnValue(createChainMock([]));

    const result = await deleteEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('1on1記録38件');
    }
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('lists both kinds of references in the message', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select = deleteSelects([{ id: 'emp-1', fullName: '山田太郎' }], 2, 5);
    db.insert.mockReturnValue(createChainMock([]));

    const result = await deleteEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('評価2件・1on1記録5件');
    }
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
    db.select = deleteSelects([{ id: 'emp-1', fullName: '山田太郎' }]);

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

describe('anonymizeEmployee', () => {
  const target = [{ id: 'emp-1', fullName: '山田太郎', avatarPath: 'https://x/avatar.png' }];

  it('clears every personal field and drops the account link', async () => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock(target));
    const chain = createChainMock([]);
    db.update.mockReturnValue(chain);
    db.insert.mockReturnValue(createChainMock([]));

    const result = await anonymizeEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(true);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: '匿名化済みの従業員',
        fullNameKana: null,
        email: null,
        birthDate: null,
        avatarPath: null,
        // 紐付けが残ると、本人限定の閲覧範囲がアカウント側から生き続ける。
        userId: null,
        status: 'retired',
      }),
    );
  });

  it('replaces the employee code so it cannot be used as a cross-system key', async () => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock(target));
    const chain = createChainMock([]);
    db.update.mockReturnValue(chain);
    db.insert.mockReturnValue(createChainMock([]));

    await anonymizeEmployee(adminCtx, 'emp-1');

    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ employeeCode: 'ANON-emp-1' }));
  });

  it('does not put the old name into the audit log', async () => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock(target));
    db.update.mockReturnValue(createChainMock([]));
    const auditInsertChain = createChainMock([]);
    db.insert.mockReturnValue(auditInsertChain);

    await anonymizeEmployee(adminCtx, 'emp-1');

    // 何を消したかの記録に個人情報を戻しては意味が無い。
    expect(auditInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employee.anonymize',
        changes: { anonymized: true },
      }),
    );
    const [[recorded]] = auditInsertChain.values.mock.calls;
    expect(JSON.stringify(recorded)).not.toContain('山田太郎');
  });

  it('refuses to anonymize twice', async () => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(
      createChainMock([{ id: 'emp-1', fullName: '匿名化済みの従業員', avatarPath: null }]),
    );
    db.update.mockReturnValue(createChainMock([]));
    db.insert.mockReturnValue(createChainMock([]));

    const result = await anonymizeEmployee(adminCtx, 'emp-1');

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns err when employee not found', async () => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([]));
    db.insert.mockReturnValue(createChainMock([]));

    const result = await anonymizeEmployee(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('従業員が見つかりません');
    }
  });

  it.each(rolesBelow('admin'))('throws AuthorizationError for %s', async (role) => {
    const { anonymizeEmployee } = await import('@/services/employee');

    await expect(anonymizeEmployee(CTX_BY_ROLE[role], 'emp-1')).rejects.toThrow(AuthorizationError);
  });

  it.each(rolesAtLeast('admin'))('allows %s', async (role) => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock(target));
    db.update.mockReturnValue(createChainMock([]));
    db.insert.mockReturnValue(createChainMock([]));

    const result = await anonymizeEmployee(CTX_BY_ROLE[role], 'emp-1');

    expect(result.success).toBe(true);
  });

  it('scopes the update to the caller org', async () => {
    const { anonymizeEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockReturnValue(createChainMock([]));
    db.insert.mockReturnValue(createChainMock([]));

    const result = await anonymizeEmployee(otherOrgCtx, 'emp-1');

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });
});

const listQuery = {
  page: 1,
  perPage: 20,
  sort: 'createdAt' as const,
  order: 'desc' as const,
};

describe('listEmployees — 絞り込みと並び順', () => {
  it('status フィルタを条件に追加する', async () => {
    // 退職者を除外できないと、在籍者一覧として使えない。
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, { ...listQuery, status: 'inactive' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'status', value: 'inactive' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('departmentId フィルタを条件に追加する', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, { ...listQuery, departmentId: 'dept-1' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'department_id', value: 'dept-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('search は氏名・カナ・社員番号・メールの OR 部分一致になる', async () => {
    // どれか1つでも欠けると、利用者は「検索しても出てこない」と感じる。
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, { ...listQuery, search: '山田' });

    const where = selectCallAt(db, 0).where.mock.calls[0][0];
    const text = sqlText(where);
    expect(text).toContain(' or ');
    expect(text).toContain('full_name');
    expect(text).toContain('full_name_kana');
    expect(text).toContain('employee_code');
    expect(text).toContain('email');
    // 前後方一致のワイルドカードが付いていること。
    expect(collectValues(where)).toContain('%山田%');
  });

  it('全フィルタを同時に指定しても org_id が消えない', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, {
      ...listQuery,
      status: 'active',
      departmentId: 'dept-1',
      search: '山田',
    });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'status', value: 'active' });
    expect(params).toContainEqual({ column: 'department_id', value: 'dept-1' });
  });

  it('order=asc のときは指定列の昇順で並べる', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, { ...listQuery, sort: 'fullName', order: 'asc' });

    const orderArgs = selectCallAt(db, 0).orderBy.mock.calls[0];
    expect(sqlText(orderArgs[0])).toContain('full_name asc');
    expect(sqlText(orderArgs[1])).toContain('id asc');
  });

  it('ページングは (page-1)*perPage を offset に変換する', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, { ...listQuery, page: 3, perPage: 50 });

    const rowsChain = selectCallAt(db, 0);
    expect(rowsChain.limit).toHaveBeenCalledWith(50);
    expect(rowsChain.offset).toHaveBeenCalledWith(100);
  });

  it('総件数クエリと明細クエリは同じ where を共有する', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(adminCtx, { ...listQuery, search: '山田' });

    expect(selectCallAt(db, 1).where.mock.calls[0][0]).toBe(
      selectCallAt(db, 0).where.mock.calls[0][0],
    );
  });

  it('別テナントのコンテキストでは、その org_id だけで絞られる', async () => {
    const { listEmployees } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ total: 0 }]]));

    await listEmployees(ctxOtherOrg, listQuery);

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(params).not.toContainEqual({ column: 'org_id', value: 'org-1' });
  });
});

describe('updateEmployee — 差分更新の詳細', () => {
  const current = {
    id: 'emp-1',
    orgId: 'org-1',
    employeeCode: 'EMP001',
    fullName: '山田太郎',
    fullNameKana: 'ヤマダタロウ',
    email: 'yamada@example.com',
    position: 'エンジニア',
    departmentId: 'dept-1',
    hiredOn: '2024-01-01',
    birthDate: null,
    avatarPath: null,
    userId: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * メールは user_id への紐付けキーなので、変更したら引き直す必要がある。
   * 引き直さないと、古いメールで紐付いたユーザーが「自分」のまま残り、
   * 別人の記録を本人として扱ってしまう。
   */
  it('メール変更時に紐付けを引き直す', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    // 1回目: 現在値 / 2回目: 新しいメールでの紐付け先
    db.select.mockImplementation(createSequentialSelect([[current], [{ id: 'user-9' }]]));

    await updateEmployee(adminCtx, 'emp-1', { email: 'new@example.com' });

    expect(updateChain.set.mock.calls[0][0]).toMatchObject({ userId: 'user-9' });
  });

  it('メール変更で一致するユーザーが居なくなったら紐付けを解除する', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ ...current, userId: 'user-9' }], []]));

    await updateEmployee(adminCtx, 'emp-1', { email: 'nobody@example.com' });

    expect(updateChain.set.mock.calls[0][0]).toMatchObject({ userId: null });
  });

  it('メールを触らない更新では紐付けを引き直さない', async () => {
    // 氏名だけの更新で余計なクエリを打たない。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ ...current, userId: 'user-9' }]]));

    await updateEmployee(adminCtx, 'emp-1', { fullName: '山田花子' });

    expect(updateChain.set.mock.calls[0][0]).not.toHaveProperty('userId');
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('メールが同じ値なら差分にならず紐付けも引き直さない', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ ...current, userId: 'user-9' }]]));

    await updateEmployee(adminCtx, 'emp-1', { email: current.email });

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('値が undefined のフィールドは差分にも set にも含めない', async () => {
    // フォームが「未入力」を undefined で送ってくるケース。
    // これを変更扱いにすると、既存の値を null で潰してしまう。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateEmployee(adminCtx, 'emp-1', {
      position: undefined,
      fullName: '山田花子',
    });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.fullName).toBe('山田花子');
    expect(setArg).not.toHaveProperty('position');

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'employee.update',
      changes: { fullName: { from: '山田太郎', to: '山田花子' } },
    });
    expect(
      (insertChain.values.mock.calls[0][0] as { changes: Record<string, unknown> }).changes,
    ).not.toHaveProperty('position');
  });

  it('空文字は null に正規化して保存する', async () => {
    // 空文字のまま保存すると「未設定」と「空で上書き」が区別できず、
    // ユニーク制約や NULL 判定が壊れる。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateEmployee(adminCtx, 'emp-1', { email: '', position: '' });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.email).toBeNull();
    expect(setArg.position).toBeNull();

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: {
        email: { from: 'yamada@example.com', to: null },
        position: { from: 'エンジニア', to: null },
      },
    });
  });

  it('既に null のフィールドに空文字を渡しても変更なしと判定する', async () => {
    // 空文字 → null の正規化後に比較しないと、
    // 何も変えていない保存で毎回 UPDATE と監査ログが走る。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    const result = await updateEmployee(adminCtx, 'emp-1', { birthDate: '' });

    expect(result).toEqual({ success: true, data: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('複数フィールドを変更すると全てが差分に載る', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateEmployee(adminCtx, 'emp-1', {
      fullName: '山田花子',
      position: 'マネージャー',
      status: 'inactive',
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: {
        fullName: { from: '山田太郎', to: '山田花子' },
        position: { from: 'エンジニア', to: 'マネージャー' },
        status: { from: 'active', to: 'inactive' },
      },
    });
  });

  it('社員番号が同じ場合は重複チェッククエリを撃たない', async () => {
    // 自分自身の社員番号で必ず重複ヒットしてしまうため、
    // ここを飛ばさないと社員番号以外の更新が一切できなくなる。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    const result = await updateEmployee(adminCtx, 'emp-1', {
      employeeCode: 'EMP001',
      fullName: '山田花子',
    });

    expect(result.success).toBe(true);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('社員番号の重複チェックは org_id 込みで行う', async () => {
    // 社員番号は組織内でのみ一意。org_id が無いと
    // 他テナントの社員番号と衝突して登録できなくなる。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current], []]));

    await updateEmployee(adminCtx, 'emp-1', { employeeCode: 'EMP999' });

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'employee_code', value: 'EMP999' });
  });

  it('UPDATE 文には id と org_id の両方を付ける', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateEmployee(adminCtx, 'emp-1', { fullName: '山田花子' });

    const params = collectParams(updateChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it.each(rolesAtLeast('admin'))('%s ロールは従業員を更新できる', async (role) => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await expect(
      updateEmployee(CTX_BY_ROLE[role], 'emp-1', { fullName: '山田花子' }),
    ).resolves.toMatchObject({ success: true });
  });

  it.each(rolesBelow('admin'))('%s ロールは従業員を更新できない', async (role) => {
    const { updateEmployee } = await import('@/services/employee');

    await expect(
      updateEmployee(CTX_BY_ROLE[role], 'emp-1', { fullName: '山田花子' }),
    ).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('createEmployee — 認可境界と重複', () => {
  it('社員番号の重複チェックは org_id 込みで行う', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'emp-new' }]);

    await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      status: 'active',
    });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'employee_code', value: 'EMP001' });
  });

  it('未入力の任意項目は null に正規化して保存する', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'emp-new' }]);

    await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      fullNameKana: '',
      email: '',
      departmentId: '',
      position: '',
      hiredOn: '',
      birthDate: '',
      status: 'active',
    });

    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      fullNameKana: null,
      email: null,
      departmentId: null,
      position: null,
      hiredOn: null,
      birthDate: null,
      status: 'active',
      // メール未入力なので紐付け先を解決できない（安全側に倒れる）
      userId: null,
    });
  });

  it('重複時は INSERT も監査ログも実行しない', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'dup' }]]));

    await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      status: 'active',
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  /**
   * 従業員レコードのメールアドレスはログインユーザーとの紐付けキーになる
   * （docs/database/authorization-matrix.md）。member が従業員を作成・更新できると、
   * 任意のレコードのメールを自分のログインメールに変えて「自分」に付け替え、
   * 本人限定の操作（自分の評価の編集など）を他人のレコードに対して行える。
   *
   * つまりここは本人チェックの土台であり、緩めると本人チェック自体が抜け道になる。
   */
  /**
   * ログインユーザーとの紐付け。
   *
   * 「このログインユーザーはどの従業員か」が分からないと、本人限定の操作
   * （自分が当事者の 1on1 だけ編集する等）を判定できない。
   * メールアドレスが結合キーになる。
   */
  it('同じ組織のメンバーとメールが一致すれば user_id を紐付ける', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    // 1回目: 社員番号の重複チェック / 2回目: 紐付け先ユーザーの解決
    db.select.mockImplementation(createSequentialSelect([[], [{ id: 'user-9' }]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'emp-new' }]);

    await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      email: 'taro@example.com',
      status: 'active',
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({ userId: 'user-9' });
  });

  it('一致するメンバーが居なければ user_id は null のまま', async () => {
    // 紐付かない場合は「自分に紐づくデータが無い」＝本人限定操作ができない、
    // という安全側に倒れる。
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'emp-new' }]);

    await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      email: 'nobody@example.com',
      status: 'active',
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({ userId: null });
  });

  it('紐付け先の検索を自組織のメンバーに限定する', async () => {
    // ここを auth.users 全体にすると、他テナントのユーザーを
    // 自組織の従業員に紐付けられてしまう。
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ id: 'user-9' }]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'emp-new' }]);

    await createEmployee(adminCtx, {
      employeeCode: 'EMP001',
      fullName: '山田太郎',
      email: 'taro@example.com',
      status: 'active',
    });

    const chain = db.select.mock.results[1].value as ChainMock;
    expect(collectParams(chain.where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
  });

  it.each(rolesBelow('admin'))('%s ロールは従業員を登録できない', async (role) => {
    const { createEmployee } = await import('@/services/employee');

    await expect(
      createEmployee(CTX_BY_ROLE[role], {
        employeeCode: 'EMP001',
        fullName: '山田太郎',
        status: 'active',
      }),
    ).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールは従業員を登録できる', async (role) => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'emp-new' }]);

    await expect(
      createEmployee(CTX_BY_ROLE[role], {
        employeeCode: 'EMP001',
        fullName: '山田太郎',
        status: 'active',
      }),
    ).resolves.toMatchObject({ success: true });
  });
});

describe('deleteEmployee — テナント分離', () => {
  it('DELETE 文に id と org_id を付ける', async () => {
    // 削除は取り消せない。org_id を落とすと他テナントの従業員を消せてしまう。
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1', fullName: '山田太郎' }]]));

    await deleteEmployee(adminCtx, 'emp-1');

    const params = collectParams(deleteChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('他テナントの ID を渡しても取得段階で弾かれ、DELETE を撃たない', async () => {
    const { deleteEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await deleteEmployee(ctxOtherOrg, 'emp-1');

    expect(result.success).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe('getEmployeeSkills', () => {
  it('従業員IDと org_id で絞り、スキル名順で返す', async () => {
    // 従業員 ID だけで引くと、他テナントの ID を指定してスキルを覗ける。
    const { getEmployeeSkills } = await import('@/services/employee');

    const rows = [
      {
        id: 'es1',
        skillId: 's1',
        skillName: 'React',
        skillCategory: 'フロントエンド',
        level: 3,
        certifiedAt: null,
      },
    ];

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([rows]));

    const result = await getEmployeeSkills(adminCtx, 'emp-1');

    expect(result).toEqual(rows);

    const chain = selectCallAt(db, 0);
    const params = collectParams(chain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'employee_id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('name asc');
  });

  it('スキルが0件でも空配列を返す', async () => {
    const { getEmployeeSkills } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getEmployeeSkills(adminCtx, 'emp-1')).resolves.toEqual([]);
  });

  it('viewer も閲覧できる', async () => {
    const { getEmployeeSkills } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getEmployeeSkills(viewerCtx, 'emp-1')).resolves.toEqual([]);
  });
});

describe('getEmployeeOneOnOnes', () => {
  it('従業員IDと org_id で絞り、実施日の降順で返す', async () => {
    // 1on1 メモは最も機微な情報。org_id が抜けると致命的。
    const { getEmployeeOneOnOnes } = await import('@/services/employee');

    const rows = [
      {
        id: 'oo1',
        heldOn: '2026-08-01',
        interviewerName: '鈴木花子',
        notes: 'メモ',
        aiSummary: null,
        moodScore: 4,
      },
    ];

    const db = await getDb();
    // 0番目は面談者のサブクエリ、1番目が本体クエリ。
    db.select.mockImplementation(createSequentialSelect([[], rows]));

    const result = await getEmployeeOneOnOnes(adminCtx, 'emp-1');

    expect(result).toEqual(rows);

    const chain = selectCallAt(db, 1);
    const params = collectParams(chain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'employee_id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('held_on desc');
  });

  it('1on1 が0件でも空配列を返す', async () => {
    const { getEmployeeOneOnOnes } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await expect(getEmployeeOneOnOnes(adminCtx, 'emp-1')).resolves.toEqual([]);
  });

  it('別テナントのコンテキストでは、その org_id で絞られる', async () => {
    const { getEmployeeOneOnOnes } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getEmployeeOneOnOnes(ctxOtherOrg, 'emp-1');

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(params).not.toContainEqual({ column: 'org_id', value: 'org-1' });
  });
});

describe('getEmployeeOneOnOnes — 当事者に限る閲覧範囲', () => {
  /**
   * 1on1 一覧と同じ範囲に揃える。従業員詳細から回り込めば他人の面談メモが
   * 読める、という抜け道を作らない。
   */
  it('admin は絞り込み条件を足さず、紐付けも引かない', async () => {
    const { getEmployeeOneOnOnes } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getEmployeeOneOnOnes(adminCtx, 'emp-1');

    // 0: 面談者サブクエリ / 1: 本体。紐付けの追加クエリは出ない。
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(sqlText(selectCallAt(db, 1).where.mock.calls[0][0])).not.toContain(' or ');
  });

  it('member には自分が当事者の記録だけ返す', async () => {
    const { getEmployeeOneOnOnes } = await import('@/services/employee');

    const db = await getDb();
    // 0: 面談者サブクエリ / 1: 自分の従業員レコード / 2: 本体
    db.select.mockImplementation(createSequentialSelect([[], [{ id: 'me' }], []]));

    await getEmployeeOneOnOnes(memberCtx, 'emp-1');

    const where = selectCallAt(db, 2).where.mock.calls[0][0];
    const params = collectParams(where);
    // 対象の従業員での絞り込みは残したまま、当事者条件を重ねる。
    expect(params).toContainEqual({ column: 'employee_id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'interviewer_id', value: 'me' });
    expect(sqlText(where)).toContain(' or ');
  });

  it('紐付いていない member には何も返さず、1on1 を引きにいかない', async () => {
    const { getEmployeeOneOnOnes } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await expect(getEmployeeOneOnOnes(memberCtx, 'emp-1')).resolves.toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});

describe('getEmployeeEvaluations', () => {
  it('従業員IDと org_id で絞り、作成日の降順で返す', async () => {
    const { getEmployeeEvaluations } = await import('@/services/employee');

    const rows = [
      {
        id: 'ev1',
        cycleName: '2026年上期',
        evaluatorName: '鈴木花子',
        status: 'submitted',
        comment: null,
        createdAt: new Date(),
      },
    ];

    const db = await getDb();
    // 0番目は評価者のサブクエリ、1番目が本体クエリ。
    db.select.mockImplementation(createSequentialSelect([[], rows]));

    const result = await getEmployeeEvaluations(adminCtx, 'emp-1');

    expect(result).toEqual(rows);

    const chain = selectCallAt(db, 1);
    const params = collectParams(chain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'employee_id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('created_at desc');
  });

  it('評価が0件でも空配列を返す', async () => {
    const { getEmployeeEvaluations } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await expect(getEmployeeEvaluations(viewerCtx, 'emp-1')).resolves.toEqual([]);
  });
});

describe('getEmployee — 生年月日のフィールド制御', () => {
  /**
   * 従業員の read は全ロールに開いている（認可マトリクス）ため、
   * 行単位の認可では生年月日を守れない。Service Layer で列を落とす。
   */
  const detail = {
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
    userId: 'user-9' as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  async function fetchAs(ctx: AuthContext, row = detail) {
    const { getEmployee } = await import('@/services/employee');
    const db = await getDb();
    db.select.mockReturnValue(createChainMock([row]));
    return getEmployee(ctx, 'emp-1');
  }

  it('admin は他人の生年月日を見られる', async () => {
    const result = await fetchAs(adminCtx);
    expect(result).toMatchObject({ success: true, data: { birthDate: '1990-05-15' } });
  });

  it('member には他人の生年月日を返さない', async () => {
    const result = await fetchAs(memberCtx);
    expect(result).toMatchObject({ success: true, data: { birthDate: null } });
  });

  it('viewer には他人の生年月日を返さない', async () => {
    const result = await fetchAs(viewerCtx);
    expect(result).toMatchObject({ success: true, data: { birthDate: null } });
  });

  it('member は自分の従業員レコードなら生年月日を見られる', async () => {
    const result = await fetchAs(memberCtx, { ...detail, userId: memberCtx.userId });
    expect(result).toMatchObject({ success: true, data: { birthDate: '1990-05-15' } });
  });

  it('未紐付けの従業員は member から見えない', async () => {
    // user_id が null のレコードを「自分」と誤判定すると、
    // マスタ登録直後の全従業員の生年月日が member に開く。
    const result = await fetchAs(memberCtx, { ...detail, userId: null });
    expect(result).toMatchObject({ success: true, data: { birthDate: null } });
  });

  it('マスクは生年月日だけで、他のフィールドはそのまま返す', async () => {
    const result = await fetchAs(viewerCtx);
    expect(result).toMatchObject({
      success: true,
      data: { fullName: '山田太郎', email: 'yamada@example.com', hiredOn: '2024-01-01' },
    });
  });
});

describe('getEmployeeEvaluations — 評価コメントのフィールド制御', () => {
  const rows = [
    {
      id: 'ev1',
      cycleName: '2026年上期',
      evaluatorId: 'me',
      evaluatorName: '自分',
      status: 'submitted',
      comment: '自分が書いた評価',
      createdAt: new Date(),
    },
    {
      id: 'ev2',
      cycleName: '2026年上期',
      evaluatorId: 'someone-else',
      evaluatorName: '鈴木花子',
      status: 'submitted',
      comment: '他人が書いた評価',
      createdAt: new Date(),
    },
  ];

  it('admin には全件のコメントを返し、紐付けの追加クエリを打たない', async () => {
    const { getEmployeeEvaluations } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], rows]));

    const result = await getEmployeeEvaluations(adminCtx, 'emp-1');

    expect(result.map((r) => r.comment)).toEqual(['自分が書いた評価', '他人が書いた評価']);
    // 0: 評価者サブクエリ / 1: 本体。admin は無条件に見えるので紐付けを引かない。
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('member には自分が評価者の評価のコメントだけ返す', async () => {
    const { getEmployeeEvaluations } = await import('@/services/employee');

    const db = await getDb();
    // 0: 評価者サブクエリ / 1: 本体 / 2: 自分の従業員レコード解決
    db.select.mockImplementation(createSequentialSelect([[], rows, [{ id: 'me' }]]));

    const result = await getEmployeeEvaluations(memberCtx, 'emp-1');

    expect(result.map((r) => r.comment)).toEqual(['自分が書いた評価', null]);
  });

  it('紐付いていない member にはコメントを返さない', async () => {
    const { getEmployeeEvaluations } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], rows, []]));

    const result = await getEmployeeEvaluations(memberCtx, 'emp-1');

    expect(result.map((r) => r.comment)).toEqual([null, null]);
  });

  it('判定に使う evaluatorId は返り値に含めない', async () => {
    // 評価者の従業員 ID は画面に不要。判定のためだけに引いている。
    const { getEmployeeEvaluations } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], rows]));

    const result = await getEmployeeEvaluations(adminCtx, 'emp-1');

    expect(result[0]).not.toHaveProperty('evaluatorId');
    expect(result[0]).toHaveProperty('evaluatorName', '自分');
  });
});

describe('社員番号の競合（一意制約違反）', () => {
  /**
   * 「重複を SELECT で確かめてから INSERT」は、確認と書き込みの間に
   * 別のリクエストが入ると壊れる。同時実行を止められるのは DB の
   * 一意制約だけなので、違反を拾って事前チェックと同じ文言に揃える。
   * ここが無いと、競合したときだけ生の Postgres エラーが画面まで出る。
   */
  const uniqueViolation = Object.assign(new Error('duplicate key value'), {
    code: '23505',
  });

  const VALID_INPUT = {
    employeeCode: 'EMP001',
    fullName: '山田太郎',
    status: 'active' as const,
  };

  it('createEmployee は INSERT が一意制約違反なら事前チェックと同じ文言を返す', async () => {
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    // 0: 重複チェック（空＝通過） / 1: 紐付けユーザー解決
    db.select.mockImplementation(createSequentialSelect([[], []]));
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(uniqueViolation),
      }),
    });

    await expect(createEmployee(adminCtx, VALID_INPUT)).resolves.toEqual({
      success: false,
      error: 'この社員番号は既に使用されています',
    });
  });

  it('updateEmployee も UPDATE の一意制約違反を同じ文言に変換する', async () => {
    // 社員番号の付け替えでも競合しうる。create 側だけ直すと片手落ち。
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'emp-1', employeeCode: 'E001', fullName: '旧名' }]]),
    );
    updateChain.then = vi
      .fn()
      .mockImplementation((_ok, onRejected) => Promise.reject(uniqueViolation).catch(onRejected));

    await expect(updateEmployee(adminCtx, 'emp-1', { fullName: '新名' })).resolves.toEqual({
      success: false,
      error: 'この社員番号は既に使用されています',
    });
  });

  it('updateEmployee も一意制約違反以外は握り潰さない', async () => {
    const { updateEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'emp-1', employeeCode: 'E001', fullName: '旧名' }]]),
    );
    updateChain.then = vi
      .fn()
      .mockImplementation((_ok, onRejected) =>
        Promise.reject(new Error('connection terminated')).catch(onRejected),
      );

    await expect(updateEmployee(adminCtx, 'emp-1', { fullName: '新名' })).rejects.toThrow(
      'connection terminated',
    );
  });

  it('createEmployee は一意制約違反以外の DB エラーは握り潰さない', async () => {
    // 握り潰すと、接続断や制約違反の別種が「重複」として表示され原因を見失う。
    const { createEmployee } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('connection terminated')),
      }),
    });

    await expect(createEmployee(adminCtx, VALID_INPUT)).rejects.toThrow('connection terminated');
  });
});

describe('assertCanUpdateAvatar', () => {
  /**
   * Storage へのアップロードは Service Layer の外で起きるため、
   * 「書き込んでよいか」だけを先に答えられる必要がある。
   * ここが緩むと、権限の無いユーザーでもファイルだけ書き換わる。
   */
  it('admin なら許可し、書き込みは一切行わない', async () => {
    const { assertCanUpdateAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1' }]]));

    await expect(assertCanUpdateAvatar(adminCtx, 'emp-1')).resolves.toEqual({
      success: true,
      data: undefined,
    });

    // 判定だけの関数。UPDATE も監査ログも走らせない。
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('存在確認を org_id で絞る', async () => {
    // Storage のパスは推測できるため、org_id が無いと
    // 他テナントの従業員 ID でアップロードを通せてしまう。
    const { assertCanUpdateAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1' }]]));

    await assertCanUpdateAvatar(adminCtx, 'emp-1');

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'emp-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('従業員が見つからなければ拒否する', async () => {
    const { assertCanUpdateAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(assertCanUpdateAvatar(adminCtx, 'missing')).resolves.toEqual({
      success: false,
      error: '従業員が見つかりません',
    });
  });

  it.each(rolesAtLeast('admin'))('%s ロールは許可される', async (role) => {
    const { assertCanUpdateAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1' }]]));

    await expect(assertCanUpdateAvatar(CTX_BY_ROLE[role], 'emp-1')).resolves.toMatchObject({
      success: true,
    });
  });

  it.each(rolesBelow('admin'))('%s ロールは DB を引く前に弾かれる', async (role) => {
    const { assertCanUpdateAvatar } = await import('@/services/employee');

    await expect(assertCanUpdateAvatar(CTX_BY_ROLE[role], 'emp-1')).rejects.toThrow(
      AuthorizationError,
    );

    const db = await getDb();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('updateEmployeeAvatar', () => {
  it('avatarPath を更新し、監査ログを残す', async () => {
    const { updateEmployeeAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1' }]]));

    const result = await updateEmployeeAvatar(adminCtx, 'emp-1', 'org-1/emp-1/avatar.png');

    expect(result).toEqual({ success: true, data: undefined });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.avatarPath).toBe('org-1/emp-1/avatar.png');
    expect(setArg.updatedAt).toBeInstanceOf(Date);

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      orgId: 'org-1',
      actorUserId: 'user-1',
      action: 'employee.avatar_update',
      resourceType: 'employee',
      resourceId: 'emp-1',
      changes: { avatarPath: 'org-1/emp-1/avatar.png' },
    });
  });

  it('存在確認・UPDATE の両方に org_id を付ける', async () => {
    // Storage 側のパスは推測できるため、org_id が無いと
    // 他テナントの従業員のアバターを差し替えられてしまう。
    const { updateEmployeeAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1' }]]));

    await updateEmployeeAvatar(adminCtx, 'emp-1', 'path.png');

    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
    const updateParams = collectParams(updateChain.where.mock.calls[0][0]);
    expect(updateParams).toContainEqual({ column: 'id', value: 'emp-1' });
    expect(updateParams).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('従業員が見つからない場合は UPDATE も監査ログも行わない', async () => {
    const { updateEmployeeAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await updateEmployeeAvatar(adminCtx, 'missing', 'path.png');

    expect(result).toEqual({ success: false, error: '従業員が見つかりません' });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールはアバターを更新できる', async (role) => {
    const { updateEmployeeAvatar } = await import('@/services/employee');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'emp-1' }]]));

    await expect(
      updateEmployeeAvatar(CTX_BY_ROLE[role], 'emp-1', 'path.png'),
    ).resolves.toMatchObject({ success: true });
  });

  it.each(rolesBelow('admin'))('%s ロールはアバターを更新できない', async (role) => {
    const { updateEmployeeAvatar } = await import('@/services/employee');

    await expect(updateEmployeeAvatar(CTX_BY_ROLE[role], 'emp-1', 'path.png')).rejects.toThrow(
      AuthorizationError,
    );

    const db = await getDb();
    expect(db.update).not.toHaveBeenCalled();
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
