import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

import { CTX_BY_ROLE, ctxOtherOrg, rolesAtLeast, rolesBelow } from '../helpers/auth-fixtures';
import { type ChainMock, createSequentialSelect } from '../helpers/db-mock';

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
  db.selectDistinct.mockReturnValue(selectChain);
  db.insert.mockReturnValue(insertChain);
  db.update.mockReturnValue(updateChain);
  db.delete.mockReturnValue(deleteChain);
});

describe('listSkills', () => {
  it('returns skills for the organization', async () => {
    const { listSkills } = await import('@/services/skill');

    const skills = [
      {
        id: 's1',
        name: 'React',
        category: 'フロントエンド',
        createdAt: new Date(),
        updatedAt: new Date(),
        employeeCount: 3,
      },
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

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'existing' }]).then(cb));

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

    const current = {
      id: 's1',
      name: 'React',
      category: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      if (selectCount === 1) return Promise.resolve([current]).then(cb);
      return Promise.resolve([]).then(cb);
    });

    const result = await updateSkill(adminCtx, {
      id: 's1',
      name: 'React.js',
      category: 'フロントエンド',
    });

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

    const current = {
      id: 's1',
      name: 'React',
      category: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
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

    const current = {
      id: 's1',
      name: 'React',
      category: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
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

    const emps = [
      { id: 'e1', employeeCode: 'EMP-001', fullName: '田中太郎', departmentName: '開発部' },
    ];
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

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'es1' }]).then(cb));

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

    await expect(removeSkillAssignment(viewerCtx, 'e1', 's1')).rejects.toThrow(AuthorizationError);
  });
});

describe('getSkill', () => {
  it('id と org_id で絞って1件返す', async () => {
    const { getSkill } = await import('@/services/skill');

    const skill = {
      id: 's1',
      name: 'React',
      category: 'フロントエンド',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[skill]]));

    const result = await getSkill(adminCtx, 's1');

    expect(result).toEqual({ success: true, data: skill });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 's1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('見つからない場合はエラーを返す', async () => {
    const { getSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await getSkill(adminCtx, 'missing');

    expect(result).toEqual({ success: false, error: 'スキルが見つかりません' });
  });

  it('他テナントのスキル ID は取得できない', async () => {
    // id だけで引くと、他社のスキル体系（＝組織構造の情報）が漏れる。
    const { getSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await getSkill(ctxOtherOrg, 's1');

    expect(result.success).toBe(false);
    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
  });

  it('viewer も閲覧できる', async () => {
    const { getSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getSkill(viewerCtx, 's1')).resolves.toMatchObject({ success: false });
  });
});

describe('getCategories', () => {
  it('カテゴリ未設定を除いた重複なしの一覧を返す', async () => {
    // category が null のスキルを含めると、絞り込み UI に
    // 空のカテゴリが並んでしまう。
    const { getCategories } = await import('@/services/skill');

    const db = await getDb();
    db.selectDistinct.mockImplementation(
      createSequentialSelect([[{ category: 'バックエンド' }, { category: 'フロントエンド' }]]),
    );

    const result = await getCategories(adminCtx);

    expect(result).toEqual(['バックエンド', 'フロントエンド']);

    const chain = db.selectDistinct.mock.results[0].value as ChainMock;
    const where = chain.where.mock.calls[0][0];
    expect(sqlText(where)).toContain('is not null');
    expect(collectParams(where)).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('category asc');
  });

  it('カテゴリが1つも無ければ空配列を返す', async () => {
    const { getCategories } = await import('@/services/skill');

    const db = await getDb();
    db.selectDistinct.mockImplementation(createSequentialSelect([[]]));

    await expect(getCategories(adminCtx)).resolves.toEqual([]);
  });

  it('別テナントのコンテキストでは、その org_id で絞られる', async () => {
    const { getCategories } = await import('@/services/skill');

    const db = await getDb();
    db.selectDistinct.mockImplementation(createSequentialSelect([[]]));

    await getCategories(ctxOtherOrg);

    const chain = db.selectDistinct.mock.results[0].value as ChainMock;
    expect(collectParams(chain.where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
  });
});

describe('listSkills — 絞り込みとページング', () => {
  it('search は名前の部分一致になり、org_id は残る', async () => {
    const { listSkills } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listSkills(adminCtx, { page: 1, perPage: 50, search: 'Rea' });

    const where = selectCallAt(db, 1).where.mock.calls[0][0];
    expect(sqlText(where)).toContain('ilike');
    expect(collectValues(where)).toContain('%Rea%');
    expect(collectParams(where)).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('category フィルタを条件に追加する', async () => {
    const { listSkills } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listSkills(adminCtx, { page: 1, perPage: 50, category: 'バックエンド' });

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'category', value: 'バックエンド' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('総件数クエリと明細クエリは同じ where を共有する', async () => {
    // 片方だけ条件が抜けると総件数とページ内容が食い違う。
    const { listSkills } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listSkills(adminCtx, { page: 1, perPage: 50, search: 'Rea' });

    expect(selectCallAt(db, 1).where.mock.calls[0][0]).toBe(
      selectCallAt(db, 0).where.mock.calls[0][0],
    );
  });

  it('ページングは (page-1)*perPage を offset に変換する', async () => {
    const { listSkills } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listSkills(adminCtx, { page: 3, perPage: 20 });

    const rowsChain = selectCallAt(db, 1);
    expect(rowsChain.limit).toHaveBeenCalledWith(20);
    expect(rowsChain.offset).toHaveBeenCalledWith(40);
  });

  it('1件も無ければ total 0・空配列を返す', async () => {
    const { listSkills } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await expect(listSkills(viewerCtx, { page: 1, perPage: 50 })).resolves.toEqual({
      skills: [],
      total: 0,
    });
  });
});

describe('createSkill — カテゴリ未指定と監査ログ', () => {
  it('カテゴリ未指定は null で保存し、監査ログにも null で残す', async () => {
    // 空文字のまま保存すると「カテゴリなし」の絞り込みが効かなくなる。
    const { createSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 's-new' }]);

    await createSkill(adminCtx, { name: 'TypeScript', category: '' });

    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      name: 'TypeScript',
      category: null,
    });
    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      orgId: 'org-1',
      actorUserId: 'user-1',
      action: 'skill.create',
      resourceType: 'skill',
      resourceId: 's-new',
      changes: { name: 'TypeScript', category: null },
    });
  });

  it('重複チェックは org_id 込みで行う', async () => {
    // スキル名は組織内でのみ一意。org_id が無いと
    // 他テナントが同名スキルを持つだけで登録できなくなる。
    const { createSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 's-new' }]);

    await createSkill(adminCtx, { name: 'React' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'name', value: 'React' });
  });

  it('重複時は INSERT も監査ログも実行しない', async () => {
    const { createSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'existing' }]]));

    await createSkill(adminCtx, { name: 'React' });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('member'))('%s ロールはスキルを作成できる', async (role) => {
    const { createSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 's-new' }]);

    await expect(createSkill(CTX_BY_ROLE[role], { name: 'React' })).resolves.toMatchObject({
      success: true,
    });
  });

  it.each(rolesBelow('member'))('%s ロールはスキルを作成できない', async (role) => {
    const { createSkill } = await import('@/services/skill');

    await expect(createSkill(CTX_BY_ROLE[role], { name: 'React' })).rejects.toThrow(
      AuthorizationError,
    );

    const db = await getDb();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('updateSkill — 差分と監査ログ', () => {
  const current = {
    id: 's1',
    name: 'React',
    category: 'フロントエンド',
    orgId: 'org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('名前とカテゴリの差分が before/after で監査ログに残る', async () => {
    const { updateSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current], []]));

    await updateSkill(adminCtx, { id: 's1', name: 'React.js', category: 'UI' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'skill.update',
      resourceType: 'skill',
      resourceId: 's1',
      changes: {
        name: { from: 'React', to: 'React.js' },
        category: { from: 'フロントエンド', to: 'UI' },
      },
    });
  });

  it('カテゴリだけを変更した場合は名前を差分に含めない', async () => {
    const { updateSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateSkill(adminCtx, { id: 's1', name: 'React', category: 'UI' });

    const changes = (insertChain.values.mock.calls[0][0] as { changes: Record<string, unknown> })
      .changes;
    expect(changes).toEqual({ category: { from: 'フロントエンド', to: 'UI' } });
    // 名前が同じなら重複チェッククエリも撃たない。
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('カテゴリを空にすると null 化され、差分に載る', async () => {
    const { updateSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateSkill(adminCtx, { id: 's1', name: 'React', category: '' });

    expect((updateChain.set.mock.calls[0][0] as Record<string, unknown>).category).toBeNull();
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: { category: { from: 'フロントエンド', to: null } },
    });
  });

  it('変更が無いときは UPDATE も監査ログも実行しない', async () => {
    const { updateSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    const result = await updateSkill(adminCtx, {
      id: 's1',
      name: 'React',
      category: 'フロントエンド',
    });

    expect(result).toEqual({ success: true, data: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('取得・更新の双方に id と org_id を付ける', async () => {
    const { updateSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateSkill(adminCtx, { id: 's1', name: 'React', category: 'UI' });

    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
    const updateParams = collectParams(updateChain.where.mock.calls[0][0]);
    expect(updateParams).toContainEqual({ column: 'id', value: 's1' });
    expect(updateParams).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it.each(rolesBelow('member'))('%s ロールはスキルを更新できない', async (role) => {
    const { updateSkill } = await import('@/services/skill');

    await expect(updateSkill(CTX_BY_ROLE[role], { id: 's1', name: 'React' })).rejects.toThrow(
      AuthorizationError,
    );
  });
});

describe('deleteSkill — 削除ガードと監査ログ', () => {
  it('DELETE 文に id と org_id を付け、監査ログを残す', async () => {
    const { deleteSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 's1', name: 'React' }], [{ count: 0 }]]),
    );

    await deleteSkill(adminCtx, 's1');

    const params = collectParams(deleteChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 's1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'skill.delete',
      resourceType: 'skill',
      resourceId: 's1',
      changes: { name: 'React' },
    });
  });

  it('割り当て件数の確認も org_id 込みで行う', async () => {
    // org_id が無いと他テナントの割り当てまで数え、
    // 削除できるはずのスキルが削除できなくなる。
    const { deleteSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 's1', name: 'React' }], [{ count: 0 }]]),
    );

    await deleteSkill(adminCtx, 's1');

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'skill_id', value: 's1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('割り当てがある場合は DELETE も監査ログも実行しない', async () => {
    const { deleteSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 's1', name: 'React' }], [{ count: 2 }]]),
    );

    const result = await deleteSkill(adminCtx, 's1');

    expect(result).toEqual({
      success: false,
      error: 'このスキルは 2 人の従業員に割り当てられているため削除できません',
    });
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールはスキルを削除できる', async (role) => {
    const { deleteSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 's1', name: 'React' }], [{ count: 0 }]]),
    );

    await expect(deleteSkill(CTX_BY_ROLE[role], 's1')).resolves.toMatchObject({ success: true });
  });

  it.each(rolesBelow('admin'))('%s ロールはスキルを削除できない', async (role) => {
    const { deleteSkill } = await import('@/services/skill');

    await expect(deleteSkill(CTX_BY_ROLE[role], 's1')).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe('getSkillMatrix — 絞り込みと端のケース', () => {
  const emps = [
    { id: 'e1', employeeCode: 'EMP-001', fullName: '田中太郎', departmentName: '開発部' },
  ];
  const skls = [{ id: 's1', name: 'React', category: 'フロントエンド' }];

  it('従業員は自組織かつ在籍中に限定される', async () => {
    // 退職者がマトリクスに残ると、スキル充足率の分母が狂う。
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getSkillMatrix(adminCtx, {});

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'status', value: 'active' });
  });

  it('departmentId フィルタを従業員側の条件に追加する', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getSkillMatrix(adminCtx, { departmentId: 'dept-1' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'department_id', value: 'dept-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('search は従業員氏名の部分一致になる', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getSkillMatrix(adminCtx, { search: '田中' });

    const where = selectCallAt(db, 0).where.mock.calls[0][0];
    expect(sqlText(where)).toContain('ilike');
    expect(collectValues(where)).toContain('%田中%');
  });

  it('category フィルタはスキル側の条件に追加される', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getSkillMatrix(adminCtx, { category: 'フロントエンド' });

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'category', value: 'フロントエンド' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('全フィルタを同時に指定しても条件が積み上がる', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getSkillMatrix(adminCtx, {
      departmentId: 'dept-1',
      search: '田中',
      category: 'フロントエンド',
    });

    const empParams = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(empParams).toContainEqual({ column: 'department_id', value: 'dept-1' });
    expect(empParams).toContainEqual({ column: 'status', value: 'active' });
    expect(collectParams(selectCallAt(db, 1).where.mock.calls[0][0])).toContainEqual({
      column: 'category',
      value: 'フロントエンド',
    });
  });

  it('従業員が0人ならセル取得クエリを撃たない', async () => {
    // 空配列を any() に渡すと不正な SQL になるため、
    // ここを飛ばすガードが必要。
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], skls]));

    const result = await getSkillMatrix(adminCtx, {});

    expect(result.cells).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('スキルが0件ならセル取得クエリを撃たない', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([emps, []]));

    const result = await getSkillMatrix(adminCtx, {});

    expect(result.cells).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('カテゴリ未設定のスキルは categories に含めない', async () => {
    // null をそのまま並べるとフィルタ UI に空欄が出る。
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        emps,
        [
          { id: 's1', name: 'React', category: 'フロントエンド' },
          { id: 's2', name: '交渉力', category: null },
          { id: 's3', name: 'Vue', category: 'フロントエンド' },
        ],
        [],
      ]),
    );

    const result = await getSkillMatrix(adminCtx, {});

    // 重複も除去されること。
    expect(result.categories).toEqual(['フロントエンド']);
  });

  it('セル取得クエリも org_id で絞る', async () => {
    const { getSkillMatrix } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([emps, skls, []]));

    await getSkillMatrix(adminCtx, {});

    expect(collectParams(selectCallAt(db, 2).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
  });
});

describe('assignSkill — 新規と更新の分岐', () => {
  it('新規割り当ては org_id 付きで INSERT し、create の監査ログを残す', async () => {
    const { assignSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e1' }], [{ id: 's1' }], []]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'es-new' }]);

    await assignSkill(adminCtx, {
      employeeId: 'e1',
      skillId: 's1',
      level: 3,
      certifiedAt: '2026-04-01',
    });

    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      employeeId: 'e1',
      skillId: 's1',
      level: 3,
      certifiedAt: '2026-04-01',
    });
    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      action: 'employee_skill.create',
      resourceType: 'employee_skill',
      resourceId: 'es-new',
      changes: { employeeId: 'e1', skillId: 's1', level: 3 },
    });
  });

  it('certifiedAt 未指定は null で保存する', async () => {
    const { assignSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e1' }], [{ id: 's1' }], []]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'es-new' }]);

    await assignSkill(adminCtx, { employeeId: 'e1', skillId: 's1', level: 3, certifiedAt: '' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({ certifiedAt: null });
  });

  it('既存割り当ては UPDATE され、update の監査ログを残す', async () => {
    // 同じスキルを再登録したときに重複行を作らないこと。
    const { assignSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'e1' }], [{ id: 's1' }], [{ id: 'es-existing' }]]),
    );

    await assignSkill(adminCtx, { employeeId: 'e1', skillId: 's1', level: 5 });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.level).toBe(5);
    expect(setArg.certifiedAt).toBeNull();
    expect(setArg.updatedAt).toBeInstanceOf(Date);

    expect(collectParams(updateChain.where.mock.calls[0][0])).toContainEqual({
      column: 'id',
      value: 'es-existing',
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'employee_skill.update',
      resourceType: 'employee_skill',
      resourceId: 'es-existing',
      changes: { employeeId: 'e1', skillId: 's1', level: 5 },
    });
  });

  it('従業員・スキル・既存割り当ての確認はすべて org_id 込みで行う', async () => {
    // org_id が無いと、他テナントの従業員 ID にスキルを紐付けられる。
    const { assignSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e1' }], [{ id: 's1' }], []]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'es-new' }]);

    await assignSkill(adminCtx, { employeeId: 'e1', skillId: 's1', level: 3 });

    for (const index of [0, 1, 2]) {
      expect(collectParams(selectCallAt(db, index).where.mock.calls[0][0])).toContainEqual({
        column: 'org_id',
        value: 'org-1',
      });
    }
  });

  it('スキルが見つからない場合は INSERT も UPDATE も行わない', async () => {
    const { assignSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e1' }], []]));

    const result = await assignSkill(adminCtx, { employeeId: 'e1', skillId: 'ghost', level: 3 });

    expect(result.success).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('member'))('%s ロールはスキルを割り当てできる', async (role) => {
    const { assignSkill } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e1' }], [{ id: 's1' }], []]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'es-new' }]);

    await expect(
      assignSkill(CTX_BY_ROLE[role], { employeeId: 'e1', skillId: 's1', level: 3 }),
    ).resolves.toMatchObject({ success: true });
  });
});

describe('removeSkillAssignment — テナント分離と監査ログ', () => {
  it('取得は employee_id・skill_id・org_id の3条件で絞る', async () => {
    const { removeSkillAssignment } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await removeSkillAssignment(ctxOtherOrg, 'e1', 's1');

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'employee_id', value: 'e1' });
    expect(params).toContainEqual({ column: 'skill_id', value: 's1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
  });

  it('削除は監査ログに従業員IDとスキルIDを残す', async () => {
    const { removeSkillAssignment } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'es1' }]]));

    await removeSkillAssignment(adminCtx, 'e1', 's1');

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'employee_skill.delete',
      resourceType: 'employee_skill',
      resourceId: 'es1',
      changes: { employeeId: 'e1', skillId: 's1' },
    });
  });

  it('見つからない場合は DELETE も監査ログも行わない', async () => {
    const { removeSkillAssignment } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await removeSkillAssignment(adminCtx, 'e1', 's1');

    expect(result.success).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('member'))('%s ロールは割り当てを解除できる', async (role) => {
    const { removeSkillAssignment } = await import('@/services/skill');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'es1' }]]));

    await expect(removeSkillAssignment(CTX_BY_ROLE[role], 'e1', 's1')).resolves.toMatchObject({
      success: true,
    });
  });
});
