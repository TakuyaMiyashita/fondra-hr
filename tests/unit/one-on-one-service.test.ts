import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

import { CTX_BY_ROLE, ctxOtherOrg, rolesAtLeast, rolesBelow } from '../helpers/auth-fixtures';
import { type ChainMock, createChainMock, createSequentialSelect } from '../helpers/db-mock';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
const memberCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'member' };
const viewerCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'viewer' };

let selectChain: ChainMock;
let insertChain: ChainMock;
let updateChain: ChainMock;
let deleteChain: ChainMock;

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

/**
 * listOneOnOnes / getOneOnOne は先に従業員のサブクエリを2本組み立てるため、
 * db.select() の呼び出し順は emp → interviewer → 本体クエリ となる。
 */
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

const baseQuery = {
  page: 1,
  perPage: 20,
  sort: 'heldOn' as const,
  order: 'desc' as const,
};

describe('listOneOnOnes', () => {
  it('総件数と明細を返す', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const rows = [
      {
        id: 'oo1',
        employeeId: 'e1',
        employeeName: '田中太郎',
        employeeCode: 'EMP-001',
        interviewerId: 'e2',
        interviewerName: '鈴木花子',
        heldOn: '2026-08-01',
        notes: 'メモ',
        aiSummary: null,
        moodScore: 4,
        createdAt: new Date(),
      },
    ];

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 37 }], rows]));

    const result = await listOneOnOnes(adminCtx, baseQuery);

    expect(result.total).toBe(37);
    expect(result.records).toEqual(rows);
  });

  it('1件も無い組織では total 0・空配列を返す', async () => {
    // 空状態の画面（EmptyState）が出せるかどうかの前提条件。
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    const result = await listOneOnOnes(adminCtx, baseQuery);

    expect(result).toEqual({ records: [], total: 0 });
  });

  it('org_id で必ず絞り込む（フィルタ未指定でも）', async () => {
    // 一覧は最もデータ量が多い経路。org_id が抜けると他テナントの
    // 1on1 メモ（極めて機微な情報）が丸ごと見えてしまう。
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, baseQuery);

    const countWhere = selectCallAt(db, 2).where.mock.calls[0][0];
    const rowsWhere = selectCallAt(db, 3).where.mock.calls[0][0];
    expect(collectParams(countWhere)).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(collectParams(rowsWhere)).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('別テナントのコンテキストでは、その org_id で絞られる', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(ctxOtherOrg, baseQuery);

    const params = collectParams(selectCallAt(db, 3).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(params).not.toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('employeeId フィルタを条件に追加する', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, { ...baseQuery, employeeId: 'e1' });

    const params = collectParams(selectCallAt(db, 3).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'employee_id', value: 'e1' });
    // フィルタを足しても org_id が消えないこと。
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('interviewerId フィルタを条件に追加する', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, { ...baseQuery, interviewerId: 'e2' });

    const params = collectParams(selectCallAt(db, 3).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'interviewer_id', value: 'e2' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('search は対象者名と面談者名の OR 部分一致になる', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, { ...baseQuery, search: '田中' });

    const where = selectCallAt(db, 3).where.mock.calls[0][0];
    const text = sqlText(where);
    expect(text).toContain(' or ');
    expect(text).toContain('ilike');
    // 前後方一致のワイルドカードが付いていること。
    const values = collectValues(where);
    expect(values).toContain('%田中%');
    expect(values).toContain('org-1');
  });

  it('全フィルタを同時に指定しても条件が積み上がる', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, {
      ...baseQuery,
      employeeId: 'e1',
      interviewerId: 'e2',
      search: '田中',
    });

    const params = collectParams(selectCallAt(db, 3).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'employee_id', value: 'e1' });
    expect(params).toContainEqual({ column: 'interviewer_id', value: 'e2' });
  });

  it('ページングは (page-1)*perPage を offset に変換する', async () => {
    // ここがずれるとページ2以降で行が飛ぶ／重複する。
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, { ...baseQuery, page: 3, perPage: 25 });

    const rowsChain = selectCallAt(db, 3);
    expect(rowsChain.limit).toHaveBeenCalledWith(25);
    expect(rowsChain.offset).toHaveBeenCalledWith(50);
  });

  it('sort=heldOn / order=desc のときは held_on の降順で並べる', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, { ...baseQuery, sort: 'heldOn', order: 'desc' });

    const orderBy = selectCallAt(db, 3).orderBy.mock.calls[0];
    expect(sqlText(orderBy[0])).toContain('held_on');
    expect(sqlText(orderBy[0])).toContain('desc');
    // タイブレーカーの id が第2キーとして必ず付くこと（ページ間の重複・欠落防止）。
    expect(sqlText(orderBy[1])).toContain('id');
    expect(sqlText(orderBy[1])).toContain('asc');
  });

  it('sort=createdAt / order=asc のときは created_at の昇順で並べる', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, { ...baseQuery, sort: 'createdAt', order: 'asc' });

    const orderBy = selectCallAt(db, 3).orderBy.mock.calls[0];
    expect(sqlText(orderBy[0])).toContain('created_at');
    expect(sqlText(orderBy[0])).toContain('asc');
  });

  it.each(rolesAtLeast('viewer'))('%s ロールは一覧を閲覧できる', async (role) => {
    // read は全ロールに開放されている（authorize は viewer の書き込みのみ拒否）。
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await expect(listOneOnOnes(CTX_BY_ROLE[role], baseQuery)).resolves.toEqual({
      records: [],
      total: 0,
    });
  });
});

describe('getOneOnOne', () => {
  it('該当レコードを詳細付きで返す', async () => {
    const { getOneOnOne } = await import('@/services/one-on-one');

    const row = {
      id: 'oo1',
      employeeId: 'e1',
      employeeName: '田中太郎',
      employeeCode: 'EMP-001',
      interviewerId: 'e2',
      interviewerName: '鈴木花子',
      heldOn: '2026-08-01',
      notes: 'メモ',
      aiSummary: null,
      moodScore: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [row]]));

    const result = await getOneOnOne(adminCtx, 'oo1');

    expect(result).toEqual({ success: true, data: row });
  });

  it('存在しない ID では失敗 Result を返す', async () => {
    const { getOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], []]));

    const result = await getOneOnOne(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('1on1記録が見つかりません');
    }
  });

  it('id と org_id の両方で絞る（他テナントの ID を渡しても掴めない）', async () => {
    // ID は URL に露出する。org_id を併用しないと ID 総当たりで
    // 他社の 1on1 記録を読めてしまう。
    const { getOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], []]));

    const result = await getOneOnOne(ctxOtherOrg, 'oo-of-org-1');

    const params = collectParams(selectCallAt(db, 2).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'oo-of-org-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(result.success).toBe(false);
  });

  it('viewer も自分が当事者の記録なら閲覧できる', async () => {
    const { getOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    // 0: 自分の従業員レコード / 1,2: 従業員サブクエリ / 3: 本体
    db.select.mockImplementation(createSequentialSelect([[{ id: 'me' }], [], [], [{ id: 'oo1' }]]));

    await expect(getOneOnOne(viewerCtx, 'oo1')).resolves.toMatchObject({ success: true });
  });
});

/**
 * 1on1 の閲覧範囲を、作成・編集と同じ「自分が当事者のものだけ」に揃える。
 *
 * 作成・編集を当事者に絞っていても、閲覧が全ロールに開いたままだと
 * member が他人の面談メモを全件読めてしまい、制限の意味が無い。
 * 1on1 の記録は本人の悩みや評価に関わるため、ここが実質的な情報保護になる。
 */
describe('1on1 の閲覧範囲', () => {
  it('admin は絞り込み条件を足さず、紐付けも引かない', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [], [{ count: 0 }], []]));

    await listOneOnOnes(adminCtx, baseQuery);

    // 0,1: 従業員サブクエリ / 2: 件数 / 3: 本体。紐付けの追加クエリは出ない。
    expect(db.select).toHaveBeenCalledTimes(4);
    const text = sqlText(selectCallAt(db, 2).where.mock.calls[0][0]);
    expect(text).not.toContain(' or ');
  });

  it('member の一覧には当事者条件が入る', async () => {
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    // 0: 自分の従業員レコード / 1,2: 従業員サブクエリ / 3: 件数 / 4: 本体
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'me' }], [], [], [{ count: 0 }], []]),
    );

    await listOneOnOnes(memberCtx, baseQuery);

    const where = selectCallAt(db, 3).where.mock.calls[0][0];
    const params = collectParams(where);
    expect(params).toContainEqual({ column: 'employee_id', value: 'me' });
    expect(params).toContainEqual({ column: 'interviewer_id', value: 'me' });
    // 対象者「または」面談者。and で繋ぐと自分同士の記録しか出ない。
    expect(sqlText(where)).toContain(' or ');
  });

  it('件数と本体に同じ条件を使う', async () => {
    // 片方だけ絞ると、見えない行を数えたページネーションになる。
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'me' }], [], [], [{ count: 0 }], []]),
    );

    await listOneOnOnes(memberCtx, baseQuery);

    expect(selectCallAt(db, 4).where.mock.calls[0][0]).toBe(
      selectCallAt(db, 3).where.mock.calls[0][0],
    );
  });

  it('紐付いていない member には何も返さず、1on1 を引きにいかない', async () => {
    // 紐付いていない＝「自分の記録が無い」。制限なしに倒してはならない。
    const { listOneOnOnes } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await listOneOnOnes(memberCtx, baseQuery);

    expect(result).toEqual({ records: [], total: 0 });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('member の詳細取得にも当事者条件が入る', async () => {
    // 一覧だけ絞っても、ID を直接叩けば読めてしまう。
    const { getOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'me' }], [], [], [{ id: 'oo1' }]]));

    await getOneOnOne(memberCtx, 'oo1');

    const where = selectCallAt(db, 3).where.mock.calls[0][0];
    expect(collectParams(where)).toContainEqual({ column: 'employee_id', value: 'me' });
    expect(sqlText(where)).toContain(' or ');
  });

  it('当事者でない記録は「見つかりません」で返す', async () => {
    // 存在の有無を伝えると、誰と誰が 1on1 をしたかが ID の総当たりで分かる。
    const { getOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'me' }], [], [], []]));

    const result = await getOneOnOne(memberCtx, 'oo1');

    expect(result).toEqual({ success: false, error: '1on1記録が見つかりません' });
  });

  it('紐付いていない member の詳細取得は 1on1 を引きにいかない', async () => {
    const { getOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await getOneOnOne(memberCtx, 'oo1');

    expect(result).toEqual({ success: false, error: '1on1記録が見つかりません' });
    expect(db.select).toHaveBeenCalledTimes(1);
  });
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

  it('挿入値に org_id を付与し、監査ログを正しい action で記録する', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      return Promise.resolve([{ id: `e${selectCount}` }]).then(cb);
    });
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'oo-new' }]);

    await createOneOnOne(adminCtx, {
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'テストメモ',
      moodScore: 4,
    });

    // 1回目: 1on1 本体。org_id を入れ忘れると他テナントに紐づかない孤児レコードになる。
    expect(insertChain.values.mock.calls[0][0]).toEqual({
      orgId: 'org-1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'テストメモ',
      moodScore: 4,
    });

    // 2回目: 監査ログ。誰がどのリソースに何をしたかが揃っていること。
    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      orgId: 'org-1',
      actorUserId: 'user-1',
      action: 'one_on_one.create',
      resourceType: 'one_on_one',
      resourceId: 'oo-new',
      changes: { employeeId: 'e1', interviewerId: 'e2', heldOn: '2026-08-01' },
    });
  });

  it('notes 未指定・moodScore 未指定は null で保存する', async () => {
    // 空文字のまま保存すると「メモあり」と区別できなくなる。
    const { createOneOnOne } = await import('@/services/one-on-one');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      return Promise.resolve([{ id: `e${selectCount}` }]).then(cb);
    });
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'oo-new' }]);

    await createOneOnOne(adminCtx, {
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: '',
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      notes: null,
      moodScore: null,
    });
  });

  it('従業員・面談者の存在確認は org_id 込みで行う', async () => {
    // org_id を付けないと、他テナントの従業員 ID を指定して
    // 自テナントに 1on1 を作れてしまう（外部キー越しの情報漏洩）。
    const { createOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e1' }], [{ id: 'e2' }]]));
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'oo-new' }]);

    await createOneOnOne(adminCtx, {
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
    });

    for (const index of [0, 1]) {
      expect(collectParams(selectCallAt(db, index).where.mock.calls[0][0])).toContainEqual({
        column: 'org_id',
        value: 'org-1',
      });
    }
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

  it('従業員が見つからない場合は insert も監査ログも行わない', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    await createOneOnOne(adminCtx, {
      employeeId: 'nonexistent',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
    });

    const db = await getDb();
    expect(db.insert).not.toHaveBeenCalled();
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

  it.each(rolesAtLeast('member'))('%s ロールは作成できる', async (role) => {
    // 作成が許可される最下位ロール = member。境界の上側。
    const { createOneOnOne } = await import('@/services/one-on-one');

    let selectCount = 0;
    selectChain.then = vi.fn().mockImplementation((cb) => {
      selectCount++;
      return Promise.resolve([{ id: `e${selectCount}` }]).then(cb);
    });
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'oo-new' }]);

    await expect(
      createOneOnOne(CTX_BY_ROLE[role], {
        employeeId: 'e1',
        interviewerId: 'e2',
        heldOn: '2026-08-01',
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it.each(rolesBelow('member'))('%s ロールは作成できない', async (role) => {
    // 境界の下側（viewer）。DB に触れる前に弾かれること。
    const { createOneOnOne } = await import('@/services/one-on-one');

    await expect(
      createOneOnOne(CTX_BY_ROLE[role], {
        employeeId: 'e1',
        interviewerId: 'e2',
        heldOn: '2026-08-01',
      }),
    ).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('updateOneOnOne', () => {
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

  it('updates a record with changes', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

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

  it('変更されたフィルドだけを差分として監査ログに残す', async () => {
    // 監査ログは「何が変わったか」が価値。未変更フィールドまで載せると
    // 実際の変更点が埋もれ、調査に使えなくなる。
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'updated notes',
      moodScore: 3,
    });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.notes).toBe('updated notes');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    // 値が変わっていない項目は set に含めない。
    expect(setArg).not.toHaveProperty('moodScore');
    expect(setArg).not.toHaveProperty('employeeId');

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'one_on_one.update',
      resourceType: 'one_on_one',
      resourceId: 'oo1',
      changes: { notes: { from: 'old notes', to: 'updated notes' } },
    });
  });

  it('変更が無いときは UPDATE も監査ログも実行しない', async () => {
    // 「保存」を連打しただけで監査ログが増えると、ログがノイズで埋まる。
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    const result = await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'old notes',
      moodScore: 3,
    });

    expect(result).toEqual({ success: true, data: undefined });
    const db = await getDb();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('notes を空にすると null 化され、差分として記録される', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: '',
      moodScore: 3,
    });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.notes).toBeNull();
  });

  it('moodScore 未指定は null として扱われ、既存値からの変更になる', async () => {
    // `input.moodScore ?? null` の分岐。0 と undefined の扱いを取り違えると
    // コンディションが意図せず消える／残る。
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'old notes',
    });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.moodScore).toBeNull();
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: { moodScore: { from: 3, to: null } },
    });
  });

  it('担当者の付け替えも差分として記録される', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e9',
      interviewerId: 'e8',
      heldOn: '2026-09-01',
      notes: 'old notes',
      moodScore: 3,
    });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      changes: {
        employeeId: { from: 'e1', to: 'e9' },
        interviewerId: { from: 'e2', to: 'e8' },
        heldOn: { from: '2026-08-01', to: '2026-09-01' },
      },
    });
  });

  it('UPDATE 文にも org_id 条件を付ける', async () => {
    // 存在確認と更新が別クエリのため、更新側にも org_id が必要
    // （確認通過後に他テナントの行を更新しないための二重防御）。
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    await updateOneOnOne(adminCtx, {
      id: 'oo1',
      employeeId: 'e1',
      interviewerId: 'e2',
      heldOn: '2026-08-01',
      notes: 'changed',
      moodScore: 3,
    });

    const params = collectParams(updateChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'id', value: 'oo1' });
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

  it.each(rolesAtLeast('admin'))('%s ロールは誰の記録でも更新できる', async (role) => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([current]).then(cb));

    await expect(
      updateOneOnOne(CTX_BY_ROLE[role], {
        id: 'oo1',
        employeeId: 'e1',
        interviewerId: 'e2',
        heldOn: '2026-08-01',
        notes: 'changed',
        moodScore: 3,
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it.each(rolesBelow('member'))('%s ロールは更新できない', async (role) => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    await expect(
      updateOneOnOne(CTX_BY_ROLE[role], {
        id: 'oo1',
        employeeId: 'e1',
        interviewerId: 'e2',
        heldOn: '2026-08-01',
      }),
    ).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.update).not.toHaveBeenCalled();
  });
});

/**
 * member の本人限定制御。
 *
 * 1on1 は本人の悩みや評価に関わる。member は自分が当事者（対象者または面談者）の
 * 記録だけを扱える。「自分」は employees.user_id との突き合わせで判定する
 * （src/services/self.ts）。
 */
describe('updateOneOnOne — member の本人チェック', () => {
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

  const input = {
    id: 'oo1',
    employeeId: 'e1',
    interviewerId: 'e2',
    heldOn: '2026-08-01',
    notes: 'changed',
    moodScore: 3,
  };

  it('自分が対象者なら更新できる', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    // 1回目: 現在の記録 / 2回目: 自分の従業員レコード
    db.select.mockImplementation(createSequentialSelect([[current], [{ id: 'e1' }]]));

    await expect(updateOneOnOne(memberCtx, input)).resolves.toMatchObject({ success: true });
  });

  it('自分が面談者でも更新できる', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current], [{ id: 'e2' }]]));

    await expect(updateOneOnOne(memberCtx, input)).resolves.toMatchObject({ success: true });
  });

  it('当事者でない記録は更新できない', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current], [{ id: 'e9' }]]));

    const result = await updateOneOnOne(memberCtx, input);

    expect(result).toEqual({
      success: false,
      error: '自分が対象者または面談者の1on1記録のみ編集できます',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('自分が入った記録を他人同士の記録に付け替えられない', async () => {
    // 変更前だけを見ていると、自分が入った記録を作ってから当事者を
    // 他人同士に差し替えることで、他人の記録を代筆できてしまう。
    const { updateOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current], [{ id: 'e1' }]]));

    const result = await updateOneOnOne(memberCtx, {
      ...input,
      employeeId: 'e8',
      interviewerId: 'e9',
    });

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('従業員レコードに紐付いていない member は更新できない', async () => {
    const { updateOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[current], []]));

    const result = await updateOneOnOne(memberCtx, input);

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('createOneOnOne — member の本人チェック', () => {
  const input = {
    employeeId: 'e1',
    interviewerId: 'e2',
    heldOn: '2026-08-01',
    notes: 'notes',
    moodScore: 3,
  };

  it('自分が当事者なら作成できる', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    // 1回目: 自分の従業員レコード / 2,3回目: 対象者・面談者の存在確認
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'e1' }], [{ id: 'e1' }], [{ id: 'e2' }]]),
    );
    insertChain.returning = vi.fn().mockResolvedValue([{ id: 'oo-new' }]);

    await expect(createOneOnOne(memberCtx, input)).resolves.toMatchObject({ success: true });
  });

  it('他人同士の記録は作成できない', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ id: 'e9' }]]));

    const result = await createOneOnOne(memberCtx, input);

    expect(result).toEqual({
      success: false,
      error: '自分が対象者または面談者の1on1記録のみ作成できます',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('従業員レコードに紐付いていない member は作成できない', async () => {
    const { createOneOnOne } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await createOneOnOne(memberCtx, input);

    expect(result.success).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
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

  it('DELETE 文に id と org_id を付け、監査ログを残す', async () => {
    // 削除は取り消せない。org_id を落とすと他テナントの記録を消せてしまう。
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'oo1' }]).then(cb));

    await deleteOneOnOne(adminCtx, 'oo1');

    const params = collectParams(deleteChain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'oo1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });

    // 削除は changes 無しで記録される（削除後に差分は取れないため）。
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'one_on_one.delete',
      resourceType: 'one_on_one',
      resourceId: 'oo1',
      changes: null,
    });
  });

  it('returns error when record not found', async () => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await deleteOneOnOne(adminCtx, 'nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }

    // 見つからないときに DELETE を撃たないこと。
    const db = await getDb();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('throws AuthorizationError for viewer', async () => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    await expect(deleteOneOnOne(viewerCtx, 'oo1')).rejects.toThrow(AuthorizationError);
  });

  it.each(rolesAtLeast('admin'))('%s ロールは削除できる', async (role) => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'oo1' }]).then(cb));

    await expect(deleteOneOnOne(CTX_BY_ROLE[role], 'oo1')).resolves.toMatchObject({
      success: true,
    });
  });

  /**
   * 1on1 記録は本人の悩みや評価に関わる機微な情報を含む。
   * 認可マトリクス（docs/database/authorization-matrix.md）でも member に
   * 削除権限を与えていない。
   *
   * 既定の authorize() は viewer 以外の書き込みを通すため、明示的に
   * admin 以上を要求しないと member が他人の記録を削除できてしまう。
   */
  it.each(rolesBelow('admin'))('%s ロールは削除できない', async (role) => {
    const { deleteOneOnOne } = await import('@/services/one-on-one');

    await expect(deleteOneOnOne(CTX_BY_ROLE[role], 'oo1')).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.delete).not.toHaveBeenCalled();
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

  it('自組織かつ在籍中の従業員のみを氏名順で返す', async () => {
    // 退職者が面談相手の選択肢に出続けると誤登録の元になる。
    const { getEmployeesForOrg } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getEmployeesForOrg(adminCtx);

    const chain = selectCallAt(db, 0);
    const params = collectParams(chain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'status', value: 'active' });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('full_name');
  });

  it('従業員が 0 人なら空配列を返す', async () => {
    const { getEmployeesForOrg } = await import('@/services/one-on-one');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getEmployeesForOrg(adminCtx)).resolves.toEqual([]);
  });

  it('viewer も従業員リストを取得できる', async () => {
    const { getEmployeesForOrg } = await import('@/services/one-on-one');

    await expect(getEmployeesForOrg(viewerCtx)).resolves.toEqual([]);
  });
});
