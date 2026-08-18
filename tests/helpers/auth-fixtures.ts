import type { AuthContext, Role } from '@/services/auth-context';

/**
 * ロール別の AuthContext。
 *
 * 認可のテストは「成功する1ケース」だけでは不十分で、
 * ロール階層の境界（許可される最下位ロールと、その1つ下）を
 * 両方通す必要がある。そのため全ロール分を用意している。
 */
export const ctxOwner: AuthContext = { userId: 'user-owner', orgId: 'org-1', role: 'owner' };
export const ctxAdmin: AuthContext = { userId: 'user-admin', orgId: 'org-1', role: 'admin' };
export const ctxMember: AuthContext = { userId: 'user-member', orgId: 'org-1', role: 'member' };
export const ctxViewer: AuthContext = { userId: 'user-viewer', orgId: 'org-1', role: 'viewer' };

/** 別テナント。org_id フィルタが効いているかの検証に使う。 */
export const ctxOtherOrg: AuthContext = { userId: 'user-other', orgId: 'org-2', role: 'owner' };

export const ALL_ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];

export const CTX_BY_ROLE: Record<Role, AuthContext> = {
  owner: ctxOwner,
  admin: ctxAdmin,
  member: ctxMember,
  viewer: ctxViewer,
};

/** 指定ロール以上を「許可」とみなしたときの、許可されるロール一覧。 */
export function rolesAtLeast(minRole: Role): Role[] {
  const order: Role[] = ['viewer', 'member', 'admin', 'owner'];
  return order.slice(order.indexOf(minRole));
}

/** 指定ロール未満（＝拒否されるべき）のロール一覧。 */
export function rolesBelow(minRole: Role): Role[] {
  const order: Role[] = ['viewer', 'member', 'admin', 'owner'];
  return order.slice(0, order.indexOf(minRole));
}
