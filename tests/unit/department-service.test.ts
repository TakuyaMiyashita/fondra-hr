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

  it('rejects a parent that does not exist in the caller org', async () => {
    // 回帰防止。以前の updateDepartment は親の存在確認を持たず、
    // 自己参照と子孫チェックしか行っていなかった。checkIsDescendant は
    // 自組織の部署しか読まないため、他テナントの部署 ID は
    // 「祖先ではない」と判定されて素通りし、テナントを跨いだ
    // parent_id が保存されていた（FK は departments.id 参照なので成立し、
    // RLS も更新対象の行は自組織なので通る）。
    const { updateDepartment } = await import('@/services/department');

    const existing = {
      id: 'd1',
      name: '部署',
      parentId: null,
      orgId: 'org-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 1回目: 更新対象の取得 → 見つかる
    // 2回目: 親の存在確認 → 他テナントの ID なので見つからない
    let call = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      call += 1;
      return Promise.resolve(call === 1 ? [existing] : []).then(cb);
    });

    const result = await updateDepartment(adminCtx, 'd1', { parentId: 'foreign-dept' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('親部署が見つかりません');
    }
    expect(updateChain.update).not.toHaveBeenCalled();
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

describe('listDepartments — テナント分離', () => {
  it('org_id で必ず絞り込む', async () => {
    const { listDepartments } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await listDepartments(ctxOtherOrg);

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(params).not.toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('部署が0件でも空配列を返す', async () => {
    // 空状態（EmptyState）の描画前提。
    const { listDepartments } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(listDepartments(viewerCtx)).resolves.toEqual([]);
  });
});

describe('getDepartmentTree — 集計とツリー組み立ての端', () => {
  it('従業員が1人もいない部署は employeeCount 0 になる', async () => {
    // 集計クエリは従業員のいる部署の行しか返さない。
    // ?? 0 が無いと undefined が UI に出て NaN 表示になる。
    const { getDepartmentTree } = await import('@/services/department');

    const depts = [
      { id: 'd1', name: '営業部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'd2', name: '総務部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
    ];

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([depts, [{ departmentId: 'd1', count: 3 }]]),
    );

    const tree = await getDepartmentTree(adminCtx);

    expect(tree.map((n) => [n.name, n.employeeCount])).toEqual([
      ['営業部', 3],
      ['総務部', 0],
    ]);
  });

  it('部署未所属（department_id が null）の集計行は無視する', async () => {
    // group by department_id には null の行が必ず含まれる。
    // これを Map に入れるとキーが null の不正なノードが生まれる。
    const { getDepartmentTree } = await import('@/services/department');

    const depts = [
      { id: 'd1', name: '営業部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
    ];

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        depts,
        [
          { departmentId: null, count: 8 },
          { departmentId: 'd1', count: 2 },
        ],
      ]),
    );

    const tree = await getDepartmentTree(adminCtx);

    expect(tree).toHaveLength(1);
    expect(tree[0].employeeCount).toBe(2);
  });

  it('親が取得結果に存在しない部署はルートとして扱う（孤児を消さない）', async () => {
    // 親が別テナントや削除済みの場合、ツリーから落ちると
    // 画面上その部署が「存在しない」ことになってしまう。
    const { getDepartmentTree } = await import('@/services/department');

    const depts = [
      { id: 'd1', name: '営業部', parentId: null, createdAt: new Date(), updatedAt: new Date() },
      {
        id: 'd9',
        name: '孤児部署',
        parentId: 'missing',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([depts, []]));

    const tree = await getDepartmentTree(adminCtx);

    expect(tree.map((n) => n.name).sort()).toEqual(['営業部', '孤児部署']);
  });

  it('両方のクエリを org_id で絞る', async () => {
    const { getDepartmentTree } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    await getDepartmentTree(ctxOtherOrg);

    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
    expect(collectParams(selectCallAt(db, 1).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
  });
});

describe('getDepartment — テナント分離', () => {
  it('id と org_id の両方で絞り込む', async () => {
    // id だけで引くと、他テナントの部署 ID を URL に入れるだけで
    // 部署名が読めてしまう。
    const { getDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getDepartment(ctxOtherOrg, 'd1');

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'd1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
  });
});

describe('createDepartment — 監査ログと認可境界', () => {
  it('org_id を付けて INSERT し、監査ログを正しい action で残す', async () => {
    const { createDepartment } = await import('@/services/department');

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'dept-new' }]);

    await createDepartment(adminCtx, { name: '新部署', parentId: '' });

    // 1回目: 部署本体。org_id が抜けると他テナントに紐づかない孤児になる。
    expect(insertChain.values.mock.calls[0][0]).toEqual({
      name: '新部署',
      parentId: null,
      orgId: 'org-1',
    });

    // 2回目: 監査ログ。
    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      orgId: 'org-1',
      actorUserId: 'user-1',
      action: 'department.create',
      resourceType: 'department',
      resourceId: 'dept-new',
      changes: { name: '新部署', parentId: null },
    });
  });

  it('親部署の存在確認は org_id 込みで行う', async () => {
    // org_id を付けないと、他テナントの部署 ID を親に指定できてしまう。
    const { createDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'p1' }]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'dept-new' }]);

    await createDepartment(adminCtx, { name: '営業1課', parentId: 'p1' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'p1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({ parentId: 'p1' });
  });

  it('親部署が見つからないときは INSERT も監査ログも実行しない', async () => {
    const { createDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await createDepartment(adminCtx, { name: '新部署', parentId: 'ghost' });

    expect(result.success).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールは部署を作成できる', async (role) => {
    const { createDepartment } = await import('@/services/department');

    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'dept-new' }]);

    await expect(createDepartment(CTX_BY_ROLE[role], { name: '新部署' })).resolves.toMatchObject({
      success: true,
    });
  });

  it.each(rolesBelow('admin'))('%s ロールは部署を作成できない', async (role) => {
    const { createDepartment } = await import('@/services/department');

    await expect(createDepartment(CTX_BY_ROLE[role], { name: '新部署' })).rejects.toThrow(
      AuthorizationError,
    );

    const db = await getDb();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('updateDepartment — 親子関係の検証と差分更新', () => {
  const current = {
    id: 'd1',
    name: '部署',
    parentId: null,
    orgId: 'org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('子孫部署を親に指定すると拒否される（循環を作らせない）', async () => {
    // d1 -> d2 -> d3 の構造で d1 の親に d3 を指定すると閉路になり、
    // 組織図の描画が無限再帰でクラッシュする。
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        [current],
        [
          { id: 'd1', parentId: null },
          { id: 'd2', parentId: 'd1' },
          { id: 'd3', parentId: 'd2' },
        ],
      ]),
    );

    const result = await updateDepartment(adminCtx, 'd1', { parentId: 'd3' });

    expect(result).toEqual({ success: false, error: '子孫部署を親部署にすることはできません' });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('直接の子を親に指定しても拒否される', async () => {
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        [current],
        [
          { id: 'd1', parentId: null },
          { id: 'd2', parentId: 'd1' },
        ],
      ]),
    );

    const result = await updateDepartment(adminCtx, 'd1', { parentId: 'd2' });

    expect(result.success).toBe(false);
  });

  it('兄弟部署（ルート直下）を親にするのは許可され、差分が監査ログに残る', async () => {
    // 祖先探索がルート（parentId = null）で正しく打ち切られる経路。
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        [current],
        [
          { id: 'd1', parentId: null },
          { id: 'd2', parentId: null },
        ],
      ]),
    );

    const result = await updateDepartment(adminCtx, 'd1', { parentId: 'd2' });

    expect(result.success).toBe(true);
    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.parentId).toBe('d2');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    // 名前は渡していないので set にも changes にも含まれない。
    expect(setArg).not.toHaveProperty('name');

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'department.update',
      resourceType: 'department',
      resourceId: 'd1',
      changes: { parentId: { from: null, to: 'd2' } },
    });
  });

  it('親子関係にデータ上の閉路があっても無限ループしない', async () => {
    // 過去の不整合データや手動 SQL で閉路が残っていた場合、
    // visited による打ち切りが無いとリクエストがハングする。
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        [current],
        [
          { id: 'd1', parentId: null },
          { id: 'd2', parentId: 'd3' },
          { id: 'd3', parentId: 'd2' },
        ],
      ]),
    );

    const result = await updateDepartment(adminCtx, 'd1', { parentId: 'd2' });

    // d1 は閉路の外なので祖先判定は false となり、更新は通る。
    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it('parentId に空文字を渡すとルート化（null）され、差分として記録される', async () => {
    const { updateDepartment } = await import('@/services/department');

    const child = { ...current, parentId: 'd0' };
    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[child]]));

    const result = await updateDepartment(adminCtx, 'd1', { parentId: '' });

    expect(result.success).toBe(true);
    // 空文字を親探索に渡さない（= 祖先チェックのクエリを撃たない）こと。
    expect(db.select).toHaveBeenCalledTimes(1);
    expect((updateChain.set.mock.calls[0][0] as Record<string, unknown>).parentId).toBeNull();
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: { parentId: { from: 'd0', to: null } },
    });
  });

  it('名前と親を同時に変更すると両方が差分に載る', async () => {
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([
        [current],
        [
          { id: 'd1', parentId: null },
          { id: 'd2', parentId: null },
        ],
      ]),
    );

    await updateDepartment(adminCtx, 'd1', { name: '新名', parentId: 'd2' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: {
        name: { from: '部署', to: '新名' },
        parentId: { from: null, to: 'd2' },
      },
    });
  });

  it('変更が無いときは UPDATE も監査ログも実行しない', async () => {
    // 「保存」連打で監査ログがノイズで埋まるのを防ぐ。
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ ...current, parentId: 'd0' }]]));

    const result = await updateDepartment(adminCtx, 'd1', { name: '部署', parentId: 'd0' });

    expect(result).toEqual({ success: true, data: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('UPDATE 文には id と org_id の両方を付ける', async () => {
    // org_id を落とすと他テナントの部署名を書き換えられてしまう。
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await updateDepartment(adminCtx, 'd1', { name: '新名' });

    const params = collectParams(updateChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'd1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('他テナントの部署 ID を渡しても取得段階で弾かれる', async () => {
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await updateDepartment(ctxOtherOrg, 'd1', { name: '新名' });

    expect(result.success).toBe(false);
    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールは部署を更新できる', async (role) => {
    const { updateDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current]]));

    await expect(
      updateDepartment(CTX_BY_ROLE[role], 'd1', { name: '新名' }),
    ).resolves.toMatchObject({ success: true });
  });

  it.each(rolesBelow('admin'))('%s ロールは部署を更新できない', async (role) => {
    const { updateDepartment } = await import('@/services/department');

    await expect(updateDepartment(CTX_BY_ROLE[role], 'd1', { name: '新名' })).rejects.toThrow(
      AuthorizationError,
    );

    const db = await getDb();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('deleteDepartment — 削除ガードと監査ログ', () => {
  function mockDeletable() {
    return createSequentialSelect([[{ id: 'd1', name: '部署' }], [{ count: 0 }], [{ count: 0 }]]);
  }

  it('DELETE 文に id と org_id を付け、監査ログを残す', async () => {
    // 削除は取り消せない。org_id を落とすと他テナントの部署を消せてしまう。
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(mockDeletable());

    await deleteDepartment(adminCtx, 'd1');

    const params = collectParams(deleteChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'd1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'department.delete',
      resourceType: 'department',
      resourceId: 'd1',
      changes: { name: '部署' },
    });
  });

  it('子部署・従業員の件数確認も org_id 込みで行う', async () => {
    // org_id が無いと他テナントの子部署を数えてしまい、
    // 消せるはずの部署が消せない／消せてはいけない部署が消える。
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(mockDeletable());

    await deleteDepartment(adminCtx, 'd1');

    const childParams = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(childParams).toContainEqual({ column: 'parent_id', value: 'd1' });
    expect(childParams).toContainEqual({ column: 'org_id', value: 'org-1' });

    const empParams = collectParams(selectCallAt(db, 2).where.mock.calls[0][0]);
    expect(empParams).toContainEqual({ column: 'department_id', value: 'd1' });
    expect(empParams).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('子部署がある場合は従業員件数を数えずに中断する', async () => {
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'd1', name: '部署' }], [{ count: 1 }]]),
    );

    const result = await deleteDepartment(adminCtx, 'd1');

    expect(result.success).toBe(false);
    // target 取得 + 子部署カウントの2回で打ち切られること。
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('従業員が所属している場合は DELETE も監査ログも実行しない', async () => {
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'd1', name: '部署' }], [{ count: 0 }], [{ count: 1 }]]),
    );

    const result = await deleteDepartment(adminCtx, 'd1');

    expect(result.success).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesAtLeast('admin'))('%s ロールは部署を削除できる', async (role) => {
    const { deleteDepartment } = await import('@/services/department');

    const db = await getDb();
    db.select.mockImplementation(mockDeletable());

    await expect(deleteDepartment(CTX_BY_ROLE[role], 'd1')).resolves.toMatchObject({
      success: true,
    });
  });

  it.each(rolesBelow('admin'))('%s ロールは部署を削除できない', async (role) => {
    const { deleteDepartment } = await import('@/services/department');

    await expect(deleteDepartment(CTX_BY_ROLE[role], 'd1')).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.delete).not.toHaveBeenCalled();
  });
});
