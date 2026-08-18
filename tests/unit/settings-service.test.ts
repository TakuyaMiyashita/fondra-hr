import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

import { CTX_BY_ROLE, ctxOtherOrg, rolesAtLeast, rolesBelow } from '../helpers/auth-fixtures';
import { type ChainMock, createSequentialSelect } from '../helpers/db-mock';

const ownerCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'owner' };
const adminCtx: AuthContext = { userId: 'user-2', orgId: 'org-1', role: 'admin' };
const memberCtx: AuthContext = { userId: 'user-3', orgId: 'org-1', role: 'member' };
const viewerCtx: AuthContext = { userId: 'user-4', orgId: 'org-1', role: 'viewer' };

function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const resolve = () => Promise.resolve(resolvedValue);

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockReturnValue(chain);

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

/** drizzle の SQL 式を、演算子が読める程度のテキストに落とす。 */
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

describe('getOrgInfo', () => {
  it('returns organization info', async () => {
    const { getOrgInfo } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) =>
      Promise.resolve([
        {
          id: 'org-1',
          name: 'テスト組織',
          slug: 'test-org',
          plan: 'free',
        },
      ]).then(cb),
    );

    const result = await getOrgInfo(ownerCtx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('テスト組織');
    }
  });

  it('returns error when org not found', async () => {
    const { getOrgInfo } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await getOrgInfo(ownerCtx);

    expect(result.success).toBe(false);
  });

  it('allows viewer to read org info', async () => {
    const { getOrgInfo } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) =>
      Promise.resolve([
        {
          id: 'org-1',
          name: 'テスト組織',
          slug: 'test-org',
          plan: 'free',
        },
      ]).then(cb),
    );

    const result = await getOrgInfo(viewerCtx);
    expect(result.success).toBe(true);
  });
});

describe('updateOrg', () => {
  it('updates organization name (admin)', async () => {
    const { updateOrg } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ name: '旧名称' }]).then(cb));

    const result = await updateOrg(adminCtx, { name: '新名称' });

    expect(result.success).toBe(true);
  });

  it('rejects update from member', async () => {
    const { updateOrg } = await import('@/services/settings');

    await expect(updateOrg(memberCtx, { name: '新名称' })).rejects.toThrow(AuthorizationError);
  });

  it('rejects update from viewer', async () => {
    const { updateOrg } = await import('@/services/settings');

    await expect(updateOrg(viewerCtx, { name: '新名称' })).rejects.toThrow(AuthorizationError);
  });

  it('skips update if name is unchanged', async () => {
    const { updateOrg } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ name: '同じ名前' }]).then(cb));

    const db = await getDb();
    const result = await updateOrg(adminCtx, { name: '同じ名前' });

    expect(result.success).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('listMembers', () => {
  it('returns members list', async () => {
    const { listMembers } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) =>
      Promise.resolve([
        {
          id: 'm-1',
          userId: 'user-1',
          email: 'owner@example.com',
          role: 'owner',
          createdAt: new Date(),
        },
        {
          id: 'm-2',
          userId: 'user-2',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
        },
      ]).then(cb),
    );

    const result = await listMembers(ownerCtx);

    expect(result).toHaveLength(2);
  });

  it('allows viewer to read members', async () => {
    const { listMembers } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await listMembers(viewerCtx);
    expect(result).toEqual([]);
  });
});

describe('changeRole', () => {
  it('changes member role (admin)', async () => {
    const { changeRole } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
        Promise.resolve([{ id: 'm-3', userId: 'user-3', orgId: 'org-1', role: 'member' }]).then(cb),
      );

    const result = await changeRole(adminCtx, { membershipId: 'm-3', role: 'viewer' });

    expect(result.success).toBe(true);
  });

  it('rejects changing owner role', async () => {
    const { changeRole } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
        Promise.resolve([{ id: 'm-1', userId: 'user-1', orgId: 'org-1', role: 'owner' }]).then(cb),
      );

    const result = await changeRole(adminCtx, { membershipId: 'm-1', role: 'member' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('オーナー');
    }
  });

  it('rejects role change from member', async () => {
    const { changeRole } = await import('@/services/settings');

    await expect(changeRole(memberCtx, { membershipId: 'm-2', role: 'viewer' })).rejects.toThrow(
      AuthorizationError,
    );
  });
});

describe('removeMember', () => {
  it('removes a member (admin)', async () => {
    const { removeMember } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
        Promise.resolve([{ id: 'm-3', userId: 'user-3', orgId: 'org-1', role: 'member' }]).then(cb),
      );

    const result = await removeMember(adminCtx, 'm-3');

    expect(result.success).toBe(true);
  });

  it('rejects removing owner', async () => {
    const { removeMember } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
        Promise.resolve([{ id: 'm-1', userId: 'user-1', orgId: 'org-1', role: 'owner' }]).then(cb),
      );

    const result = await removeMember(adminCtx, 'm-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('オーナー');
    }
  });

  it('rejects self-removal', async () => {
    const { removeMember } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
        Promise.resolve([{ id: 'm-2', userId: 'user-2', orgId: 'org-1', role: 'admin' }]).then(cb),
      );

    const result = await removeMember(adminCtx, 'm-2');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('自分自身');
    }
  });

  it('rejects removal from member role', async () => {
    const { removeMember } = await import('@/services/settings');

    await expect(removeMember(memberCtx, 'm-2')).rejects.toThrow(AuthorizationError);
  });
});

describe('createInvitation', () => {
  it('creates invitation (admin)', async () => {
    const { createInvitation } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));
    insertChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'inv-1', token: 'abc123' }]).then(cb));

    const result = await createInvitation(adminCtx, {
      email: 'new@example.com',
      role: 'member',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBe('abc123');
    }
  });

  it('rejects duplicate member', async () => {
    const { createInvitation } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'm-existing' }]).then(cb));

    const result = await createInvitation(adminCtx, {
      email: 'existing@example.com',
      role: 'member',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('既にメンバー');
    }
  });

  it('rejects invitation from member role', async () => {
    const { createInvitation } = await import('@/services/settings');

    await expect(
      createInvitation(memberCtx, {
        email: 'new@example.com',
        role: 'member',
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('revokeInvitation', () => {
  it('revokes invitation (admin)', async () => {
    const { revokeInvitation } = await import('@/services/settings');

    selectChain.then = vi
      .fn()
      .mockImplementation((cb) =>
        Promise.resolve([{ id: 'inv-1', email: 'invited@example.com' }]).then(cb),
      );

    const result = await revokeInvitation(adminCtx, 'inv-1');

    expect(result.success).toBe(true);
  });

  it('returns error for non-existent invitation', async () => {
    const { revokeInvitation } = await import('@/services/settings');

    selectChain.then = vi.fn().mockImplementation((cb) => Promise.resolve([]).then(cb));

    const result = await revokeInvitation(adminCtx, 'inv-999');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('見つかりません');
    }
  });

  it('rejects revocation from viewer', async () => {
    const { revokeInvitation } = await import('@/services/settings');

    await expect(revokeInvitation(viewerCtx, 'inv-1')).rejects.toThrow(AuthorizationError);
  });
});

describe('getOrgInfo / updateOrg — 組織不在と監査ログ', () => {
  it('組織が存在しない場合は UPDATE を撃たずにエラーを返す', async () => {
    // 組織が削除済みなのに更新に進むと、0行更新が成功扱いになり
    // 監査ログだけが残る（実態と食い違う記録）。
    const { updateOrg } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await updateOrg(adminCtx, { name: '新名称' });

    expect(result).toEqual({ success: false, error: '組織が見つかりません' });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('組織名の変更は before/after 付きで監査ログに残る', async () => {
    const { updateOrg } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ name: '旧名称' }]]));

    await updateOrg(adminCtx, { name: '新名称' });

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.name).toBe('新名称');
    expect(setArg.updatedAt).toBeInstanceOf(Date);

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      orgId: 'org-1',
      actorUserId: 'user-2',
      action: 'organization.update',
      resourceType: 'organization',
      resourceId: 'org-1',
      changes: { name: { from: '旧名称', to: '新名称' } },
    });
  });

  it('名称が同じときは監査ログも残さない', async () => {
    const { updateOrg } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ name: '同じ名前' }]]));

    await updateOrg(adminCtx, { name: '同じ名前' });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('ctx.orgId 以外の組織は読めない／更新できない', async () => {
    const { getOrgInfo, updateOrg } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getOrgInfo(ctxOtherOrg);
    expect(collectParams(selectCallAt(db, 0).where.mock.calls[0][0])).toContainEqual({
      column: 'id',
      value: 'org-2',
    });

    await updateOrg(ctxOtherOrg, { name: '乗っ取り' });
    expect(collectParams(selectCallAt(db, 1).where.mock.calls[0][0])).toContainEqual({
      column: 'id',
      value: 'org-2',
    });
  });

  it.each(rolesAtLeast('admin'))('%s ロールは組織名を更新できる', async (role) => {
    const { updateOrg } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ name: '旧名称' }]]));

    await expect(updateOrg(CTX_BY_ROLE[role], { name: '新名称' })).resolves.toMatchObject({
      success: true,
    });
  });

  it.each(rolesBelow('admin'))('%s ロールは組織名を更新できない', async (role) => {
    const { updateOrg } = await import('@/services/settings');

    await expect(updateOrg(CTX_BY_ROLE[role], { name: '新名称' })).rejects.toThrow(
      AuthorizationError,
    );
  });
});

describe('listMembers — テナント分離', () => {
  it('自組織のメンバーだけを参加日順で返す', async () => {
    // org_id が抜けると全テナントのメールアドレス一覧が漏れる。
    const { listMembers } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await listMembers(ctxOtherOrg);

    const chain = selectCallAt(db, 0);
    expect(collectParams(chain.where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-2',
    });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('created_at asc');
  });
});

describe('changeRole — 見つからない・変更なし・監査ログ', () => {
  it('メンバーが見つからない場合は UPDATE も監査ログも行わない', async () => {
    const { changeRole } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await changeRole(adminCtx, { membershipId: 'm-999', role: 'member' });

    expect(result).toEqual({ success: false, error: 'メンバーが見つかりません' });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('同じロールを指定したときは UPDATE も監査ログも行わない', async () => {
    // 画面で変更せずに保存したケース。監査ログが無意味に増えるのを防ぐ。
    const { changeRole } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'm-3', userId: 'user-3', orgId: 'org-1', role: 'member' }]]),
    );

    const result = await changeRole(adminCtx, { membershipId: 'm-3', role: 'member' });

    expect(result).toEqual({ success: true, data: undefined });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('対象メンバーの取得は membership_id と org_id の両方で絞る', async () => {
    // org_id が無いと、他テナントの membership_id を指定して
    // そのテナントの権限を書き換えられてしまう。
    const { changeRole } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await changeRole(adminCtx, { membershipId: 'm-3', role: 'viewer' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'm-3' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('ロール変更は before/after 付きで監査ログに残る', async () => {
    const { changeRole } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'm-3', userId: 'user-3', orgId: 'org-1', role: 'member' }]]),
    );

    await changeRole(adminCtx, { membershipId: 'm-3', role: 'admin' });

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'membership.update',
      resourceType: 'membership',
      resourceId: 'm-3',
      changes: { role: { from: 'member', to: 'admin' } },
    });
  });

  it.each(rolesBelow('admin'))('%s ロールはロールを変更できない', async (role) => {
    const { changeRole } = await import('@/services/settings');

    await expect(
      changeRole(CTX_BY_ROLE[role], { membershipId: 'm-3', role: 'admin' }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('removeMember — 見つからない・監査ログ', () => {
  it('メンバーが見つからない場合は DELETE も監査ログも行わない', async () => {
    const { removeMember } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await removeMember(adminCtx, 'm-999');

    expect(result).toEqual({ success: false, error: 'メンバーが見つかりません' });
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('削除対象の取得は membership_id と org_id の両方で絞る', async () => {
    const { removeMember } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await removeMember(ctxOtherOrg, 'm-3');

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'id', value: 'm-3' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
  });

  it('メンバー削除は監査ログに userId を残す', async () => {
    const { removeMember } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'm-3', userId: 'user-3', orgId: 'org-1', role: 'member' }]]),
    );

    await removeMember(adminCtx, 'm-3');

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'membership.delete',
      resourceType: 'membership',
      resourceId: 'm-3',
      changes: { userId: 'user-3' },
    });
  });

  it.each(rolesBelow('admin'))('%s ロールはメンバーを削除できない', async (role) => {
    const { removeMember } = await import('@/services/settings');

    await expect(removeMember(CTX_BY_ROLE[role], 'm-3')).rejects.toThrow(AuthorizationError);
  });
});

describe('createInvitation — 重複招待と監査ログ', () => {
  it('有効な招待が既にある場合は二重発行しない', async () => {
    // 招待を重複発行すると、古いトークンでも参加できてしまい
    // 「取り消したはずの招待が生きている」状態になる。
    const { createInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [{ id: 'inv-existing' }]]));

    const result = await createInvitation(adminCtx, { email: 'new@example.com', role: 'member' });

    expect(result).toEqual({
      success: false,
      error: 'このメールアドレスへの有効な招待が既に存在します',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('既存招待の判定は「未承諾かつ未期限切れ」に限定する', async () => {
    // 期限切れ・承諾済みの招待まで重複扱いにすると、
    // 再招待が永久にできなくなる。
    const { createInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));
    insertChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'inv-1', token: 'tok' }]).then(cb));

    await createInvitation(adminCtx, { email: 'new@example.com', role: 'member' });

    const where = selectCallAt(db, 1).where.mock.calls[0][0];
    const text = sqlText(where);
    expect(text).toContain('is null');
    expect(text).toContain('>');
    expect(collectParams(where)).toContainEqual({ column: 'org_id', value: 'org-1' });
  });

  it('既存メンバー判定も org_id で絞る', async () => {
    // org_id が無いと、他テナントに同じメールのユーザーがいるだけで
    // 招待できなくなる（他テナントの存在が漏れる）。
    const { createInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));
    insertChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'inv-1', token: 'tok' }]).then(cb));

    await createInvitation(adminCtx, { email: 'new@example.com', role: 'member' });

    const params = collectParams(selectCallAt(db, 0).where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'org_id', value: 'org-1' });
    expect(params).toContainEqual({ column: 'email', value: 'new@example.com' });
  });

  it('招待は org_id 付きで作成され、有効期限は7日後になる', async () => {
    const { createInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));
    insertChain.then = vi
      .fn()
      .mockImplementation((cb) => Promise.resolve([{ id: 'inv-1', token: 'tok' }]).then(cb));

    const before = Date.now();
    await createInvitation(adminCtx, { email: 'new@example.com', role: 'admin' });

    const values = insertChain.values.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({ orgId: 'org-1', email: 'new@example.com', role: 'admin' });
    const expiresAt = values.expiresAt as Date;
    const days = (expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    expect(insertChain.values.mock.calls[1][0]).toMatchObject({
      action: 'invitation.create',
      resourceType: 'invitation',
      resourceId: 'inv-1',
      changes: { email: 'new@example.com', role: 'admin' },
    });
  });
});

describe('listPendingInvitations', () => {
  it('未承諾かつ未期限切れの招待だけを自組織から返す', async () => {
    // 期限切れの招待が一覧に残ると、管理者が「まだ有効」と誤認する。
    const { listPendingInvitations } = await import('@/services/settings');

    const rows = [
      {
        id: 'inv-1',
        email: 'a@example.com',
        role: 'member',
        expiresAt: new Date(),
        createdAt: new Date(),
      },
    ];

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([rows]));

    const result = await listPendingInvitations(adminCtx);

    expect(result).toEqual(rows);

    const chain = selectCallAt(db, 0);
    const text = sqlText(chain.where.mock.calls[0][0]);
    expect(text).toContain('is null');
    expect(text).toContain('>');
    expect(collectParams(chain.where.mock.calls[0][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
    expect(sqlText(chain.orderBy.mock.calls[0][0])).toContain('created_at asc');
  });

  it('保留中の招待が無ければ空配列を返す', async () => {
    const { listPendingInvitations } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(listPendingInvitations(ownerCtx)).resolves.toEqual([]);
  });

  it.each(rolesAtLeast('admin'))('%s ロールは保留中の招待を閲覧できる', async (role) => {
    const { listPendingInvitations } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(listPendingInvitations(CTX_BY_ROLE[role])).resolves.toEqual([]);
  });

  it.each(rolesBelow('admin'))('%s ロールは保留中の招待を閲覧できない', async (role) => {
    // 招待一覧には未参加者のメールアドレスが並ぶ。read でも admin 以上に限定する。
    const { listPendingInvitations } = await import('@/services/settings');

    await expect(listPendingInvitations(CTX_BY_ROLE[role])).rejects.toThrow(AuthorizationError);

    const db = await getDb();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('revokeInvitation — 監査ログとテナント分離', () => {
  it('取消対象は id・org_id・未承諾の3条件で絞る', async () => {
    // 承諾済みの招待を「取り消し」できてしまうと、
    // 既に参加済みのメンバーの記録だけが消える。
    const { revokeInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await revokeInvitation(ctxOtherOrg, 'inv-1');

    const where = selectCallAt(db, 0).where.mock.calls[0][0];
    const params = collectParams(where);
    expect(params).toContainEqual({ column: 'id', value: 'inv-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(sqlText(where)).toContain('is null');
  });

  it('取消は監査ログにメールアドレスを残す', async () => {
    const { revokeInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ id: 'inv-1', email: 'invited@example.com' }]]),
    );

    await revokeInvitation(adminCtx, 'inv-1');

    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      action: 'invitation.delete',
      resourceType: 'invitation',
      resourceId: 'inv-1',
      changes: { email: 'invited@example.com' },
    });
  });

  it('見つからない場合は DELETE も監査ログも行わない', async () => {
    const { revokeInvitation } = await import('@/services/settings');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await revokeInvitation(adminCtx, 'inv-999');

    expect(result.success).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(rolesBelow('admin'))('%s ロールは招待を取り消せない', async (role) => {
    const { revokeInvitation } = await import('@/services/settings');

    await expect(revokeInvitation(CTX_BY_ROLE[role], 'inv-1')).rejects.toThrow(AuthorizationError);
  });
});
