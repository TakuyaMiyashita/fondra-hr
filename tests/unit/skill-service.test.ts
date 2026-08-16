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
  chain.selectDistinct = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
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
  db.selectDistinct.mockReturnValue(selectChain);
  db.insert.mockReturnValue(insertChain);
  db.update.mockReturnValue(updateChain);
  db.delete.mockReturnValue(deleteChain);
});

describe('listSkills', () => {
  it('returns skills for the organization', async () => {
    const { listSkills } = await import('@/services/skill');

    const skills = [
      { id: 's1', name: 'React', category: 'フロントエンド', createdAt: new Date(), updatedAt: new Date(), employeeCount: 3 },
    ];
    const countResult = [{ count: 1 }];

    let callCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      callCount++;
      if (callCount === 1) return Promise.resolve(countResult).then(cb);
      return Promise.resolve(skills).then(cb);
    });

    const result = await listSkills(adminCtx, { page: 1, perPage: 50 });
    expect(result.skills).toEqual(skills);
    expect(result.total).toBe(1);
  });

  it('applies category filter', async () => {
    const { listSkills } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([{ count: 0 }]).then(cb));

    await listSkills(adminCtx, { page: 1, perPage: 50, category: 'バックエンド' });

    expect(selectChain.where).toHaveBeenCalled();
  });

  it('applies search filter', async () => {
    const { listSkills } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([{ count: 0 }]).then(cb));

    await listSkills(adminCtx, { page: 1, perPage: 50, search: 'React' });

    expect(selectChain.where).toHaveBeenCalled();
  });
});

describe('createSkill', () => {
  it('creates a skill and writes audit log', async () => {
    const { createSkill } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 's-new' }]);

    const result = await createSkill(adminCtx, { name: 'TypeScript', category: 'プログラミング' });

    expect(result).toEqual({ success: true, data: { id: 's-new' } });

    const db = await getDb();
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('returns error on duplicate name', async () => {
    const { createSkill } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([{ id: 'existing' }]).then(cb));

    const result = await createSkill(adminCtx, { name: 'React' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('既に使用されています');
    }
  });

  it('throws AuthorizationError for viewer', async () => {
    const { createSkill } = await import('@/services/skill');

    await expect(createSkill(viewerCtx, { name: 'React' })).rejects.toThrow(AuthorizationError);
  });
});

describe('updateSkill', () => {
  it('updates a skill and writes audit log', async () => {
    const { updateSkill } = await import('@/services/skill');

    const current = { id: 's1', name: 'React', category: null, orgId: 'org-1', createdAt: new Date(), updatedAt: new Date() };
    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([current]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await updateSkill(adminCtx, { id: 's1', name: 'React.js', category: 'フロントエンド' });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it('returns error when skill not found', async () => {
    const { updateSkill } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await updateSkill(adminCtx, { id: 'nonexistent', name: 'React' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('returns error on duplicate name', async () => {
    const { updateSkill } = await import('@/services/skill');

    const current = { id: 's1', name: 'React', category: null, orgId: 'org-1', createdAt: new Date(), updatedAt: new Date() };
    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([current]).then(cb);
      return Promise.resolve([{ id: 's2' }]).then(cb);
    });

    const result = await updateSkill(adminCtx, { id: 's1', name: 'Vue.js' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('既に使用されています');
    }
  });

  it('returns ok when no changes', async () => {
    const { updateSkill } = await import('@/services/skill');

    const current = { id: 's1', name: 'React', category: null, orgId: 'org-1', createdAt: new Date(), updatedAt: new Date() };
    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    const result = await updateSkill(adminCtx, { id: 's1', name: 'React', category: '' });

    expect(result.success).toBe(true);
  });
});

describe('deleteSkill', () => {
  it('deletes a skill for admin', async () => {
    const { deleteSkill } = await import('@/services/skill');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 's1', name: 'React' }]).then(cb);
      return Promise.resolve([{ count: 0 }]).then(cb);
    });

    const result = await deleteSkill(adminCtx, 's1');

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.delete).toHaveBeenCalled();
  });

  it('rejects deletion by member', async () => {
    const { deleteSkill } = await import('@/services/skill');

    await expect(deleteSkill(memberCtx, 's1')).rejects.toThrow(AuthorizationError);
  });

  it('returns error when skill has assignments', async () => {
    const { deleteSkill } = await import('@/services/skill');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 's1', name: 'React' }]).then(cb);
      return Promise.resolve([{ count: 3 }]).then(cb);
    });

    const result = await deleteSkill(adminCtx, 's1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('割り当てられている');
    }
  });

  it('returns error when skill not found', async () => {
    const { deleteSkill } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await deleteSkill(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });
});

describe('getSkillMatrix', () => {
  it('returns matrix data', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const emps = [{ id: 'e1', employeeCode: 'EMP-001', fullName: '田中太郎', departmentName: '開発部' }];
    const skls = [{ id: 's1', name: 'React', category: 'フロントエンド' }];
    const cells = [{ employeeId: 'e1', skillId: 's1', level: 3, certifiedAt: null }];

    let callCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      callCount++;
      if (callCount === 1) return Promise.resolve(emps).then(cb);
      if (callCount === 2) return Promise.resolve(skls).then(cb);
      return Promise.resolve(cells).then(cb);
    });

    const result = await getSkillMatrix(adminCtx, {});

    expect(result.employees).toEqual(emps);
    expect(result.skills).toEqual(skls);
    expect(result.cells).toEqual(cells);
    expect(result.categories).toEqual(['フロントエンド']);
  });

  it('returns empty when no data', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await getSkillMatrix(adminCtx, {});

    expect(result.employees).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.cells).toEqual([]);
  });
});

describe('assignSkill', () => {
  it('creates a new assignment', async () => {
    const { assignSkill } = await import('@/services/skill');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'e1' }]).then(cb);
      if (selectCount === 2) return Promise.resolve([{ id: 's1' }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'es-new' }]);

    const result = await assignSkill(adminCtx, {
      employeeId: 'e1',
      skillId: 's1',
      level: 3,
    });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.insert).toHaveBeenCalled();
  });

  it('updates an existing assignment', async () => {
    const { assignSkill } = await import('@/services/skill');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'e1' }]).then(cb);
      if (selectCount === 2) return Promise.resolve([{ id: 's1' }]).then(cb);
      return Promise.resolve([{ id: 'es-existing' }]).then(cb);
    });

    const result = await assignSkill(adminCtx, {
      employeeId: 'e1',
      skillId: 's1',
      level: 4,
    });

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.update).toHaveBeenCalled();
  });

  it('returns error when employee not found', async () => {
    const { assignSkill } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await assignSkill(adminCtx, {
      employeeId: 'nonexistent',
      skillId: 's1',
      level: 3,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('従業員が見つかりません');
    }
  });

  it('returns error when skill not found', async () => {
    const { assignSkill } = await import('@/services/skill');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([{ id: 'e1' }]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await assignSkill(adminCtx, {
      employeeId: 'e1',
      skillId: 'nonexistent',
      level: 3,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('スキルが見つかりません');
    }
  });

  it('rejects assignment by viewer', async () => {
    const { assignSkill } = await import('@/services/skill');

    await expect(
      assignSkill(viewerCtx, { employeeId: 'e1', skillId: 's1', level: 3 }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('removeSkillAssignment', () => {
  it('removes an assignment', async () => {
    const { removeSkillAssignment } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([{ id: 'es1' }]).then(cb));

    const result = await removeSkillAssignment(adminCtx, 'e1', 's1');

    expect(result.success).toBe(true);
    const db = await getDb();
    expect(db.delete).toHaveBeenCalled();
  });

  it('returns error when assignment not found', async () => {
    const { removeSkillAssignment } = await import('@/services/skill');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await removeSkillAssignment(adminCtx, 'e1', 's1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('rejects removal by viewer', async () => {
    const { removeSkillAssignment } = await import('@/services/skill');

    await expect(
      removeSkillAssignment(viewerCtx, 'e1', 's1'),
    ).rejects.toThrow(AuthorizationError);
  });
});
