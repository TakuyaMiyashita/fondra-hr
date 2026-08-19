import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { employees } from '@/db/schema/employees';
import { invitations } from '@/db/schema/invitations';
import { memberships } from '@/db/schema/memberships';
import { organizations } from '@/db/schema/organizations';
import { type Result, err, ok } from '@/lib/result';
import type { Role } from '@/services/auth-context';

export async function createOrganizationWithOwner(
  userId: string,
  orgName: string,
): Promise<Result<{ orgId: string }>> {
  const slug =
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9぀-ゟ゠-ヿ一-龯]+/g, '-')
      .replace(/^-|-$/g, '') || `org-${Date.now().toString(36)}`;

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

type InvitationByToken = {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  expiresAt: Date;
  acceptedAt: Date | null;
  orgName: string;
};

/**
 * 招待をトークンで引く。未受諾かつ未失効のものだけを返す。
 *
 * 戻り値の型に null を明示しているのは、配列の分割代入では TypeScript が
 * 要素を常に存在するものとして推論してしまい、呼び出し側の
 * 「見つからなければ拒否する」ガードが到達不能コードに見えてしまうため。
 * このガードは招待受諾のセキュリティ境界そのものなので、型の上でも必須にする。
 */
export async function getInvitationByToken(token: string): Promise<InvitationByToken | null> {
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
  email: string,
): Promise<Result<void>> {
  try {
    await db.insert(memberships).values({ userId, orgId, role });

    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitationId));

    // 招待より先に従業員レコードが作られているのが実務上は普通なので
    // （入社手続きで登録し、後からアカウントを発行する）、ここでも紐付ける。
    // 従業員側からの紐付け（createEmployee）だけでは、この順序で漏れる。
    //
    // 既に紐付け済みのレコードは触らない。管理者が意図して別ユーザーに
    // 紐付けたものを、後から来た招待が奪わないようにするため。
    await db
      .update(employees)
      .set({ userId, updatedAt: new Date() })
      .where(
        and(
          eq(employees.orgId, orgId),
          isNull(employees.userId),
          sql`lower(${employees.email}) = lower(${email})`,
        ),
      );

    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err(`招待の承認に失敗しました: ${message}`);
  }
}
