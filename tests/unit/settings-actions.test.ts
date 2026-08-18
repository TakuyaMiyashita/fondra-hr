import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * 組織設定・メンバー管理の Server Actions。
 *
 * ここは「ロール変更」「メンバー削除」「招待発行」という
 * テナントの権限境界そのものを動かす操作を扱う層なので、
 * 以下の定型分岐を全て通す。
 *
 *   1. Zod バリデーション失敗 → err(最初のメッセージ) / Service は呼ばれない
 *   2. 正常系              → Service の結果をそのまま返す
 *   3. revalidatePath      → 成功時のみ（失敗時に呼ぶとキャッシュが無駄に飛ぶ）
 *   4. AuthorizationError  → err('権限がありません')
 *   5. それ以外の例外        → 握り潰さず再 throw
 *
 * 特に 5 が重要。DB 障害を err に変換してしまうと、
 * 「権限エラー」と「インフラ障害」が UI 上で区別できなくなり、
 * 監視・ロールバック判断ができなくなる。
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth', () => ({ getAuthContext }));

vi.mock('@/services/settings', () => ({
  getOrgInfo: vi.fn(),
  updateOrg: vi.fn(),
  listMembers: vi.fn(),
  changeRole: vi.fn(),
  removeMember: vi.fn(),
  createInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
}));

async function svc() {
  return vi.mocked(await import('@/services/settings'));
}

async function actions() {
  return import('@/app/(dashboard)/settings/actions');
}

const MEMBERSHIP_ID = '11111111-1111-4111-8111-111111111111';
const INVITATION_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
});

describe('fetchOrgInfo', () => {
  it('returns the service result and passes the caller AuthContext through', async () => {
    // ctx を取り違えると別テナントの組織情報を返してしまうため、引数まで検証する。
    const { fetchOrgInfo } = await actions();
    const s = await svc();
    s.getOrgInfo.mockResolvedValue(ok({ id: 'org-1', name: 'Acme' }) as never);

    expect(await fetchOrgInfo()).toEqual(ok({ id: 'org-1', name: 'Acme' }));
    expect(s.getOrgInfo).toHaveBeenCalledWith(ctxAdmin);
  });

  it('passes a service-level failure through unchanged', async () => {
    const { fetchOrgInfo } = await actions();
    const s = await svc();
    s.getOrgInfo.mockResolvedValue(err('組織が見つかりません') as never);

    expect(await fetchOrgInfo()).toEqual(err('組織が見つかりません'));
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchOrgInfo } = await actions();
    const s = await svc();
    s.getOrgInfo.mockRejectedValue(new AuthorizationError('read', 'organization'));

    expect(await fetchOrgInfo()).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    const { fetchOrgInfo } = await actions();
    const s = await svc();
    s.getOrgInfo.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchOrgInfo()).rejects.toThrow('connection terminated');
  });
});

describe('updateOrgAction', () => {
  it('rejects a blank organization name with the schema message', async () => {
    const { updateOrgAction } = await actions();
    const s = await svc();

    expect(await updateOrgAction({ name: '' })).toEqual(err('組織名を入力してください'));
    expect(s.updateOrg).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a name longer than 100 characters', async () => {
    // 上限側の境界。DB カラム長を超える値を Service に渡さないための防波堤。
    const { updateOrgAction } = await actions();
    const s = await svc();

    expect(await updateOrgAction({ name: 'a'.repeat(101) })).toEqual(
      err('組織名は100文字以内で入力してください'),
    );
    expect(s.updateOrg).not.toHaveBeenCalled();
  });

  it('rejects a completely malformed payload', async () => {
    const { updateOrgAction } = await actions();
    const s = await svc();

    expect((await updateOrgAction(null)).success).toBe(false);
    expect(s.updateOrg).not.toHaveBeenCalled();
  });

  it('revalidates /settings on success and forwards the parsed input', async () => {
    const { updateOrgAction } = await actions();
    const s = await svc();
    s.updateOrg.mockResolvedValue(ok(undefined) as never);

    expect(await updateOrgAction({ name: 'Acme Inc' })).toEqual(ok(undefined));
    expect(s.updateOrg).toHaveBeenCalledWith(ctxAdmin, { name: 'Acme Inc' });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { updateOrgAction } = await actions();
    const s = await svc();
    s.updateOrg.mockResolvedValue(err('組織が見つかりません') as never);

    expect(await updateOrgAction({ name: 'Acme Inc' })).toEqual(err('組織が見つかりません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { updateOrgAction } = await actions();
    const s = await svc();
    s.updateOrg.mockRejectedValue(new AuthorizationError('update', 'organization'));

    expect(await updateOrgAction({ name: 'Acme Inc' })).toEqual(err('権限がありません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    const { updateOrgAction } = await actions();
    const s = await svc();
    s.updateOrg.mockRejectedValue(new Error('deadlock detected'));

    await expect(updateOrgAction({ name: 'Acme Inc' })).rejects.toThrow('deadlock detected');
  });
});

describe('fetchMembers', () => {
  it('wraps the raw member list into a successful Result', async () => {
    // Service は素の配列を返す設計なので、ok() でラップされることを確認する。
    const { fetchMembers } = await actions();
    const s = await svc();
    s.listMembers.mockResolvedValue([{ membershipId: MEMBERSHIP_ID, role: 'member' }] as never);

    expect(await fetchMembers()).toEqual(ok([{ membershipId: MEMBERSHIP_ID, role: 'member' }]));
    expect(s.listMembers).toHaveBeenCalledWith(ctxAdmin);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchMembers } = await actions();
    const s = await svc();
    s.listMembers.mockRejectedValue(new AuthorizationError('read', 'membership'));

    expect(await fetchMembers()).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { fetchMembers } = await actions();
    const s = await svc();
    s.listMembers.mockRejectedValue(new Error('boom'));

    await expect(fetchMembers()).rejects.toThrow('boom');
  });
});

describe('changeRoleAction', () => {
  it('rejects a non-UUID membershipId without touching the service', async () => {
    // ロール変更は権限昇格に直結する。ID の形式が壊れた要求は Service に届かせない。
    const { changeRoleAction } = await actions();
    const s = await svc();

    expect((await changeRoleAction({ membershipId: 'not-a-uuid', role: 'admin' })).success).toBe(
      false,
    );
    expect(s.changeRole).not.toHaveBeenCalled();
  });

  it('rejects escalation to owner, which is not an assignable role', async () => {
    // 'owner' はスキーマの enum に含まれない。
    // ここが通ると任意のメンバーをオーナーに昇格できてしまうため、最重要の境界。
    const { changeRoleAction } = await actions();
    const s = await svc();

    expect((await changeRoleAction({ membershipId: MEMBERSHIP_ID, role: 'owner' })).success).toBe(
      false,
    );
    expect(s.changeRole).not.toHaveBeenCalled();
  });

  it('rejects an unknown role string', async () => {
    const { changeRoleAction } = await actions();
    const s = await svc();

    expect(
      (await changeRoleAction({ membershipId: MEMBERSHIP_ID, role: 'superuser' })).success,
    ).toBe(false);
    expect(s.changeRole).not.toHaveBeenCalled();
  });

  it('revalidates the members page on success', async () => {
    const { changeRoleAction } = await actions();
    const s = await svc();
    s.changeRole.mockResolvedValue(ok(undefined) as never);

    expect(await changeRoleAction({ membershipId: MEMBERSHIP_ID, role: 'admin' })).toEqual(
      ok(undefined),
    );
    expect(s.changeRole).toHaveBeenCalledWith(ctxAdmin, {
      membershipId: MEMBERSHIP_ID,
      role: 'admin',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/members');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { changeRoleAction } = await actions();
    const s = await svc();
    s.changeRole.mockResolvedValue(err('最後のオーナーのロールは変更できません') as never);

    expect((await changeRoleAction({ membershipId: MEMBERSHIP_ID, role: 'admin' })).success).toBe(
      false,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { changeRoleAction } = await actions();
    const s = await svc();
    s.changeRole.mockRejectedValue(new AuthorizationError('update', 'membership'));

    expect(await changeRoleAction({ membershipId: MEMBERSHIP_ID, role: 'admin' })).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { changeRoleAction } = await actions();
    const s = await svc();
    s.changeRole.mockRejectedValue(new Error('boom'));

    await expect(changeRoleAction({ membershipId: MEMBERSHIP_ID, role: 'admin' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('removeMemberAction', () => {
  it('revalidates the members page on success', async () => {
    const { removeMemberAction } = await actions();
    const s = await svc();
    s.removeMember.mockResolvedValue(ok(undefined) as never);

    expect(await removeMemberAction(MEMBERSHIP_ID)).toEqual(ok(undefined));
    expect(s.removeMember).toHaveBeenCalledWith(ctxAdmin, MEMBERSHIP_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/settings/members');
  });

  it('does not revalidate when the service refuses the removal', async () => {
    // 「最後のオーナーは削除できない」等の業務ルール違反時にキャッシュを飛ばさない。
    const { removeMemberAction } = await actions();
    const s = await svc();
    s.removeMember.mockResolvedValue(err('最後のオーナーは削除できません') as never);

    expect(await removeMemberAction(MEMBERSHIP_ID)).toEqual(err('最後のオーナーは削除できません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { removeMemberAction } = await actions();
    const s = await svc();
    s.removeMember.mockRejectedValue(new AuthorizationError('delete', 'membership'));

    expect(await removeMemberAction(MEMBERSHIP_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { removeMemberAction } = await actions();
    const s = await svc();
    s.removeMember.mockRejectedValue(new Error('boom'));

    await expect(removeMemberAction(MEMBERSHIP_ID)).rejects.toThrow('boom');
  });
});

describe('inviteMemberAction', () => {
  it('rejects an invalid email address', async () => {
    const { inviteMemberAction } = await actions();
    const s = await svc();

    expect(await inviteMemberAction({ email: 'not-an-email', role: 'member' })).toEqual(
      err('有効なメールアドレスを入力してください'),
    );
    expect(s.createInvitation).not.toHaveBeenCalled();
  });

  it('rejects inviting someone directly as owner', async () => {
    // 招待経由でオーナー権限を配れてしまうと、テナントの所有権が奪われる。
    const { inviteMemberAction } = await actions();
    const s = await svc();

    expect(await inviteMemberAction({ email: 'a@example.com', role: 'owner' })).toEqual(
      err('ロールを選択してください'),
    );
    expect(s.createInvitation).not.toHaveBeenCalled();
  });

  it('rejects a missing role', async () => {
    const { inviteMemberAction } = await actions();
    const s = await svc();

    expect((await inviteMemberAction({ email: 'a@example.com' })).success).toBe(false);
    expect(s.createInvitation).not.toHaveBeenCalled();
  });

  it('returns the issued token and revalidates on success', async () => {
    const { inviteMemberAction } = await actions();
    const s = await svc();
    s.createInvitation.mockResolvedValue(ok({ token: 'tok-1' }) as never);

    expect(await inviteMemberAction({ email: 'a@example.com', role: 'member' })).toEqual(
      ok({ token: 'tok-1' }),
    );
    expect(s.createInvitation).toHaveBeenCalledWith(ctxAdmin, {
      email: 'a@example.com',
      role: 'member',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/members');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { inviteMemberAction } = await actions();
    const s = await svc();
    s.createInvitation.mockResolvedValue(err('このメールアドレスは既に招待済みです') as never);

    expect((await inviteMemberAction({ email: 'a@example.com', role: 'member' })).success).toBe(
      false,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { inviteMemberAction } = await actions();
    const s = await svc();
    s.createInvitation.mockRejectedValue(new AuthorizationError('create', 'invitation'));

    expect(await inviteMemberAction({ email: 'a@example.com', role: 'member' })).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { inviteMemberAction } = await actions();
    const s = await svc();
    s.createInvitation.mockRejectedValue(new Error('boom'));

    await expect(inviteMemberAction({ email: 'a@example.com', role: 'member' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('fetchPendingInvitations', () => {
  it('wraps the raw invitation list into a successful Result', async () => {
    const { fetchPendingInvitations } = await actions();
    const s = await svc();
    s.listPendingInvitations.mockResolvedValue([{ id: INVITATION_ID }] as never);

    expect(await fetchPendingInvitations()).toEqual(ok([{ id: INVITATION_ID }]));
    expect(s.listPendingInvitations).toHaveBeenCalledWith(ctxAdmin);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchPendingInvitations } = await actions();
    const s = await svc();
    s.listPendingInvitations.mockRejectedValue(new AuthorizationError('read', 'invitation'));

    expect(await fetchPendingInvitations()).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { fetchPendingInvitations } = await actions();
    const s = await svc();
    s.listPendingInvitations.mockRejectedValue(new Error('boom'));

    await expect(fetchPendingInvitations()).rejects.toThrow('boom');
  });
});

describe('revokeInvitationAction', () => {
  it('revalidates the members page on success', async () => {
    const { revokeInvitationAction } = await actions();
    const s = await svc();
    s.revokeInvitation.mockResolvedValue(ok(undefined) as never);

    expect(await revokeInvitationAction(INVITATION_ID)).toEqual(ok(undefined));
    expect(s.revokeInvitation).toHaveBeenCalledWith(ctxAdmin, INVITATION_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/settings/members');
  });

  it('does not revalidate when the invitation is already gone', async () => {
    const { revokeInvitationAction } = await actions();
    const s = await svc();
    s.revokeInvitation.mockResolvedValue(err('招待が見つかりません') as never);

    expect(await revokeInvitationAction(INVITATION_ID)).toEqual(err('招待が見つかりません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { revokeInvitationAction } = await actions();
    const s = await svc();
    s.revokeInvitation.mockRejectedValue(new AuthorizationError('delete', 'invitation'));

    expect(await revokeInvitationAction(INVITATION_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { revokeInvitationAction } = await actions();
    const s = await svc();
    s.revokeInvitation.mockRejectedValue(new Error('boom'));

    await expect(revokeInvitationAction(INVITATION_ID)).rejects.toThrow('boom');
  });
});

describe('AuthContext acquisition failures', () => {
  it('rethrows when getAuthContext itself fails', async () => {
    // セッション切れやテナント未選択で ctx が取れないとき、
    // 「権限がありません」に丸めてしまうと原因究明ができない。
    const { fetchMembers } = await actions();
    getAuthContext.mockRejectedValue(new Error('No active session'));

    await expect(fetchMembers()).rejects.toThrow('No active session');
  });

  it('converts an AuthorizationError raised by getAuthContext', async () => {
    const { fetchMembers } = await actions();
    getAuthContext.mockRejectedValue(new AuthorizationError('read', 'membership'));

    expect(await fetchMembers()).toEqual(err('権限がありません'));
  });
});
