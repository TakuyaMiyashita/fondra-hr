import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError } from '@/services/authorize';

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
