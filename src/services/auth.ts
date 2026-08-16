import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { invitations } from '@/db/schema/invitations';
import { memberships } from '@/db/schema/memberships';
import { organizations } from '@/db/schema/organizations';
import { type Result, err, ok } from '@/lib/result';
import type { Role } from '@/services/auth-context';

export async function createOrganizationWithOwner(
  userId: string,
  orgName: string,
): Promise<Result<{ orgId: string }>> {
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9぀-ゟ゠-ヿ一-龯]+/g, '-')
    .replace(/^-|-$/g, '')
    || `org-${Date.now().toString(36)}`;

  const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

  try {
    const [org] = await db
      .insert(organizations)
      .values({ name: orgName, slug: uniqueSlug })
      .returning({ id: organizations.id });

    await db.insert(memberships).values({
      userId,
      orgId: org.id,
      role: 'owner',
    });

    return ok({ orgId: org.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err(`組織の作成に失敗しました: ${message}`);
  }
}

export async function getUserMemberships(userId: string) {
  return db
    .select({
      orgId: memberships.orgId,
      role: memberships.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgPlan: organizations.plan,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId));
}

export async function switchOrganization(
  userId: string,
  targetOrgId: string,
): Promise<Result<{ orgId: string; role: string }>> {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, targetOrgId)))
    .limit(1);

  if (!membership) {
    return err('この組織へのアクセス権がありません');
  }

  return ok({ orgId: membership.orgId, role: membership.role });
}

export async function getInvitationByToken(token: string) {
  const [invitation] = await db
    .select({
      id: invitations.id,
      orgId: invitations.orgId,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      orgName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.orgId, organizations.id))
    .where(
      and(
        eq(invitations.token, token),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return invitation ?? null;
}

export async function acceptInvitation(
  invitationId: string,
  userId: string,
  orgId: string,
  role: Role,
): Promise<Result<void>> {
  try {
    await db.insert(memberships).values({ userId, orgId, role });

    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitationId));

    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err(`招待の承認に失敗しました: ${message}`);
  }
}
