import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { invitations } from '@/db/schema/invitations';
import { authUsers, memberships } from '@/db/schema/memberships';
import { organizations } from '@/db/schema/organizations';
import { type Result, err, ok } from '@/lib/result';
import type {
  ChangeRoleInput,
  InviteMemberInput,
  UpdateOrgInput,
} from '@/lib/validations/settings';
import { writeAuditLog } from '@/services/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize, hasMinRole } from '@/services/authorize';
import type { OrgInfo, OrgMember, PendingInvitation } from '@/types/settings';

export async function getOrgInfo(ctx: AuthContext): Promise<Result<OrgInfo>> {
  authorize(ctx, 'read', 'organization');

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);

  if (!org) {
    return err('組織が見つかりません');
  }

  return ok(org);
}

export async function updateOrg(
  ctx: AuthContext,
  input: UpdateOrgInput,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'organization', (c) => hasMinRole(c, 'admin'));

  const [current] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);

  if (!current) {
    return err('組織が見つかりません');
  }

  if (current.name === input.name) {
    return ok(undefined);
  }

  await db
    .update(organizations)
    .set({ name: input.name, updatedAt: new Date() })
    .where(eq(organizations.id, ctx.orgId));

  await writeAuditLog(ctx, 'organization.update', 'organization', ctx.orgId, {
    name: { from: current.name, to: input.name },
  });

  return ok(undefined);
}

export async function listMembers(ctx: AuthContext): Promise<OrgMember[]> {
  authorize(ctx, 'read', 'membership');

  const rows = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      email: authUsers.email,
      role: memberships.role,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(authUsers, eq(memberships.userId, authUsers.id))
    .where(eq(memberships.orgId, ctx.orgId))
    .orderBy(asc(memberships.createdAt));

  return rows as OrgMember[];
}

export async function changeRole(
  ctx: AuthContext,
  input: ChangeRoleInput,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'membership', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.id, input.membershipId), eq(memberships.orgId, ctx.orgId)),
    )
    .limit(1);

  if (!target) {
    return err('メンバーが見つかりません');
  }

  if (target.role === 'owner') {
    return err('オーナーのロールは変更できません');
  }

  if (target.role === input.role) {
    return ok(undefined);
  }

  await db
    .update(memberships)
    .set({ role: input.role, updatedAt: new Date() })
    .where(eq(memberships.id, input.membershipId));

  await writeAuditLog(ctx, 'membership.update', 'membership', input.membershipId, {
    role: { from: target.role, to: input.role },
  });

  return ok(undefined);
}

export async function removeMember(
  ctx: AuthContext,
  membershipId: string,
): Promise<Result<void>> {
  authorize(ctx, 'delete', 'membership', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.orgId)),
    )
    .limit(1);

  if (!target) {
    return err('メンバーが見つかりません');
  }

  if (target.role === 'owner') {
    return err('オーナーは削除できません');
  }

  if (target.userId === ctx.userId) {
    return err('自分自身を削除することはできません');
  }

  await db
    .delete(memberships)
    .where(eq(memberships.id, membershipId));

  await writeAuditLog(ctx, 'membership.delete', 'membership', membershipId, {
    userId: target.userId,
  });

  return ok(undefined);
}

export async function createInvitation(
  ctx: AuthContext,
  input: InviteMemberInput,
): Promise<Result<{ token: string }>> {
  authorize(ctx, 'create', 'invitation', (c) => hasMinRole(c, 'admin'));

  const existingMember = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(authUsers, eq(memberships.userId, authUsers.id))
    .where(
      and(eq(memberships.orgId, ctx.orgId), eq(authUsers.email, input.email)),
    )
    .limit(1);

  if (existingMember.length > 0) {
    return err('このメールアドレスのユーザーは既にメンバーです');
  }

  const existingInvite = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.orgId, ctx.orgId),
        eq(invitations.email, input.email),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existingInvite.length > 0) {
    return err('このメールアドレスへの有効な招待が既に存在します');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const [created] = await db
    .insert(invitations)
    .values({
      orgId: ctx.orgId,
      email: input.email,
      role: input.role,
      expiresAt,
    })
    .returning({ id: invitations.id, token: invitations.token });

  await writeAuditLog(ctx, 'invitation.create', 'invitation', created.id, {
    email: input.email,
    role: input.role,
  });

  return ok({ token: created.token });
}

export async function listPendingInvitations(
  ctx: AuthContext,
): Promise<PendingInvitation[]> {
  authorize(ctx, 'read', 'invitation', (c) => hasMinRole(c, 'admin'));

  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.orgId, ctx.orgId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.createdAt));

  return rows as PendingInvitation[];
}

export async function revokeInvitation(
  ctx: AuthContext,
  invitationId: string,
): Promise<Result<void>> {
  authorize(ctx, 'delete', 'invitation', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: invitations.id, email: invitations.email })
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.orgId, ctx.orgId),
        isNull(invitations.acceptedAt),
      ),
    )
    .limit(1);

  if (!target) {
    return err('招待が見つかりません');
  }

  await db.delete(invitations).where(eq(invitations.id, invitationId));

  await writeAuditLog(ctx, 'invitation.delete', 'invitation', invitationId, {
    email: target.email,
  });

  return ok(undefined);
}
