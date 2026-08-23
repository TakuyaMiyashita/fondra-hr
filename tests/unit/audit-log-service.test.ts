import { beforeEach, describe, expect, it, vi } from 'vitest';

import { REDACTED } from '@/services/audit-log';
import type { AuthContext } from '@/services/auth-context';

import { ctxOtherOrg } from '../helpers/auth-fixtures';
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
    insert: ReturnType<typeof vi.fn>;
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

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
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

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await getResourceTypes(adminCtx);

    expect(result).toEqual([]);
  });
});

const baseQuery = { page: 1, perPage: 20, order: 'desc' as const };

describe('listAuditLogs — 絞り込み・並び順・テナント分離', () => {
  it('action フィルタを条件に追加する', async () => {
    // 監査ログは「特定の操作だけを追う」使い方が主。action 条件が
    // 落ちると調査画面が全件表示になり、実質使い物にならない。
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, { ...baseQuery, action: 'employee.delete' });

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'action', value: 'employee.delete' });
    // フィルタを足しても org_id が消えないこと。
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('resourceType と action を同時に指定すると両方が条件に積み上がる', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, {
      ...baseQuery,
      resourceType: 'employee',
      action: 'employee.update',
    });

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'resource_type', value: 'employee' });
    expect(params).toContainEqual({ column: 'action', value: 'employee.update' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('総件数クエリと明細クエリは同じ where を共有する', async () => {
    // 片方だけ条件が抜けると、総件数とページ内容が食い違い
    // 「最終ページが空」といった不具合になる。
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, { ...baseQuery, action: 'skill.create' });

    const countParams = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    const rowParams = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(countParams).toEqual(rowParams);
  });

  it('order=asc のときは created_at の昇順で並べる', async () => {
    // 三項演算子の asc 側。降順しか通していないと、
    // 「古い順」表示が壊れていても気付けない。
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, { ...baseQuery, order: 'asc' });

    const orderArgs = selectCallAt(db, 1).orderBy.mock.calls[0];
    expect(sqlText(orderArgs[0])).toContain('created_at asc');
  });

  it('order=desc のときは created_at の降順で並べる', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, { ...baseQuery, order: 'desc' });

    const orderArgs = selectCallAt(db, 1).orderBy.mock.calls[0];
    expect(sqlText(orderArgs[0])).toContain('created_at desc');
  });

  it('created_at に加えて id をタイブレーカーにする', async () => {
    // created_at は一括操作で同値になる。id が無いとページ間で
    // 行の重複・欠落が起きる。
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, baseQuery);

    const orderArgs = selectCallAt(db, 1).orderBy.mock.calls[0];
    expect(orderArgs).toHaveLength(2);
    expect(sqlText(orderArgs[1])).toContain('id asc');
  });

  it('ページングは (page-1)*perPage を offset に変換する', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(adminCtx, { page: 4, perPage: 25, order: 'desc' });

    const rowsChain = selectCallAt(db, 1);
    expect(rowsChain.limit).toHaveBeenCalledWith(25);
    expect(rowsChain.offset).toHaveBeenCalledWith(75);
  });

  it('別テナントのコンテキストでは、その org_id だけで絞られる', async () => {
    // 監査ログは「誰が何をしたか」の記録。他テナント分が混ざると
    // 内部統制上そのまま事故になる。
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await listAuditLogs(ctxOtherOrg, baseQuery);

    const params = collectParams(selectCallAt(db, 1).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(params).not.toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('1件も無い組織では total 0・空配列を返す', async () => {
    const { listAuditLogs } = await import('@/services/audit-log');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ count: 0 }], []]));

    await expect(listAuditLogs(adminCtx, baseQuery)).resolves.toEqual({ logs: [], total: 0 });
  });
});

describe('getResourceTypes — テナント分離', () => {
  it('自組織の org_id で絞り、resource_type 昇順で返す', async () => {
    const { getResourceTypes } = await import('@/services/audit-log');

    const db = await getDb();
    db.selectDistinct.mockImplementation(createSequentialSelect([[]]));

    await getResourceTypes(ctxOtherOrg);

    const chain = db.selectDistinct.mock.results[0].value as ChainMock;
    expect(collectParams(chain.where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('resource_type asc');
  });
});

describe('writeAuditLog', () => {
  it('ctx の org_id / user_id と、渡された action・resourceType を記録する', async () => {
    // 監査ログの本体。actor が欠けると「誰がやったか」が追えなくなる。
    const { writeAuditLog } = await import('@/services/audit-log');

    const db = await getDb();
    const insertChain = createSequentialSelect([[]])() as ChainMock;
    db.insert.mockReturnValue(insertChain);

    await writeAuditLog(adminCtx, 'employee.create', 'employee', 'emp-1', { fullName: '山田太郎' });

    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      actorUserId: 'user-1',
      action: 'employee.create',
      resourceType: 'employee',
      resourceId: 'emp-1',
      changes: { fullName: '山田太郎' },
    });
  });

  it('changes 省略時は undefined ではなく null で保存する', async () => {
    // undefined のまま渡すと Drizzle が列自体を省略し、
    // NOT NULL 制約やデフォルト値の挙動に依存してしまう。
    const { writeAuditLog } = await import('@/services/audit-log');

    const db = await getDb();
    const insertChain = createSequentialSelect([[]])() as ChainMock;
    db.insert.mockReturnValue(insertChain);

    await writeAuditLog(adminCtx, 'evaluation.delete', 'evaluation', null);

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      resourceId: null,
      changes: null,
    });
  });
});

describe('writeAuditLog — 機微フィールドの伏せ字', () => {
  async function write(changes: Record<string, unknown>) {
    const { writeAuditLog } = await import('@/services/audit-log');

    const db = await getDb();
    const insertChain = createSequentialSelect([[]])() as ChainMock;
    db.insert.mockReturnValue(insertChain);

    await writeAuditLog(adminCtx, 'x.update', 'x', 'id-1', changes);

    return insertChain.values.mock.calls[0][0].changes as Record<string, unknown>;
  }

  // 監査ログは viewer も読める（認可マトリクス）。ここに値を素通しで書くと、
  // field-visibility.ts と self.ts の可視制御が丸ごと打ち消される。
  it.each([
    ['birthDate', '1990-01-01'],
    ['notes', 'キャリアの相談を受けた'],
    ['comment', '目標を達成した'],
    ['aiSummary', '前向きな面談だった'],
    ['ratings', { technical: 5 }],
  ])('%s は from / to の両方を伏せる', async (field, value) => {
    const changes = await write({ [field]: { from: value, to: value } });

    expect(changes[field]).toEqual({ from: REDACTED, to: REDACTED });
    expect(JSON.stringify(changes)).not.toContain(JSON.stringify(value).slice(1, -1));
  });

  it('{ from, to } 形式でない素の値も伏せる', async () => {
    // createEmployee は cleanInput の戻り値をそのまま渡すため、
    // birthDate が入れ子ではなく素の値で来る経路がある。
    const changes = await write({ birthDate: '1990-01-01', fullName: '山田太郎' });

    expect(changes).toEqual({ birthDate: REDACTED, fullName: '山田太郎' });
  });

  it('機微でないフィールドは値をそのまま残す', async () => {
    // 伏せ過ぎると監査ログとして役に立たなくなる。
    const changes = await write({
      employeeCode: { from: 'E001', to: 'E002' },
      status: { from: 'active', to: 'retired' },
    });

    expect(changes).toEqual({
      employeeCode: { from: 'E001', to: 'E002' },
      status: { from: 'active', to: 'retired' },
    });
  });

  it('伏せてもフィールド名と項目数は残る', async () => {
    // 「誰がいつ何を変えたか」は監査ログの本体なので、そこは落とさない。
    const changes = await write({
      notes: { from: 'a', to: 'b' },
      heldOn: { from: '2026-01-01', to: '2026-01-02' },
    });

    expect(Object.keys(changes)).toEqual(['notes', 'heldOn']);
  });
});
