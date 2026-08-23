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
    // 組織とオーナーのメンバーシップは1つの単位。片方だけ残ると
    // 「誰も入れない組織」ができ、アプリからは削除も参加もできなくなる
    // （purge_organization は service_role 専用）。
    // しかも呼び出し側はエラーを見て作り直すため、孤児が積み上がる。
    const orgId = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: orgName, slug: uniqueSlug })
        .returning({ id: organizations.id });

      await tx.insert(memberships).values({
        userId,
        orgId: org.id,
        role: 'owner',
      });

      return org.id;
    });

    return ok({ orgId });
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
    // 3つの書き込みは1つの単位。途中で落ちると、メンバーにはなったのに
    // 招待が未消費のまま残る（別のアカウントで再受諾できる）、
    // あるいは従業員レコードと紐付かず本人限定の操作ができない、
    // といった中途半端な状態になる。
    await db.transaction(async (tx) => {
      await tx.insert(memberships).values({ userId, orgId, role });

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitationId));

      // 招待より先に従業員レコードが作られているのが実務上は普通なので
      // （入社手続きで登録し、後からアカウントを発行する）、ここでも紐付ける。
      // 従業員側からの紐付け（createEmployee）だけでは、この順序で漏れる。
      //
      // 既に紐付け済みのレコードは触らない。管理者が意図して別ユーザーに
      // 紐付けたものを、後から来た招待が奪わないようにするため。
      await tx
        .update(employees)
        .set({ userId, updatedAt: new Date() })
        .where(
          and(
            eq(employees.orgId, orgId),
            isNull(employees.userId),
            sql`lower(${employees.email}) = lower(${email})`,
          ),
        );
    });

    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err(`招待の承認に失敗しました: ${message}`);
  }
}

/**
 * メール確認を待っているサインアップの内容。
 *
 * 確認前に組織・メンバーシップを作ると、確認されなかった登録のぶんだけ
 * 「誰も入れない組織」が残り、招待経路では `accepted_at` だけが立って
 * 招待が消費されてしまう。そのため作成内容を user_metadata に預けておき、
 * 確認後（/auth/callback）にここで消化する。
 */
type PendingSignUp =
  { kind: 'invitation'; token: string } | { kind: 'organization'; orgName: string };

/** user_metadata に預けるキー。signUp 側と /auth/callback 側で共有する。 */
export const PENDING_ORG_NAME_KEY = 'pending_org_name';
export const PENDING_INVITATION_TOKEN_KEY = 'pending_invitation_token';

function readPendingSignUp(metadata: Record<string, unknown> | null | undefined) {
  const token = metadata?.[PENDING_INVITATION_TOKEN_KEY];
  if (typeof token === 'string' && token !== '') {
    return { kind: 'invitation', token } satisfies PendingSignUp;
  }

  const orgName = metadata?.[PENDING_ORG_NAME_KEY];
  if (typeof orgName === 'string' && orgName !== '') {
    return { kind: 'organization', orgName } satisfies PendingSignUp;
  }

  return null;
}

/**
 * メール確認後に、保留していた組織作成 / 招待受諾を実行する。
 *
 * `created` が true のときは JWT の app_metadata に org_id / role が
 * 入っていないため、呼び出し側で必ずセッションをリフレッシュすること。
 * これを怠るとリダイレクトループになる（signUp のコメント参照）。
 *
 * user_metadata はクライアントから書き換えられる領域である点に注意する。
 * 組織作成は「未所属のユーザーが自分の組織を作る」だけなのでサインアップと
 * 等価だが、招待受諾は権限が伴うため、トークンに加えて確認済みメールとの
 * 一致も要求する。
 */
export async function completePendingSignUp(
  userId: string,
  email: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): Promise<Result<{ created: boolean }>> {
  const pending = readPendingSignUp(metadata);
  if (!pending) {
    return ok({ created: false });
  }

  // 既にどこかに所属していれば消化済み。パスワード再設定など、確認以外の
  // 用途で同じコールバックを通ったときに組織を作り直さないためのガード。
  const existing = await getUserMemberships(userId);
  if (existing.length > 0) {
    return ok({ created: false });
  }

  if (pending.kind === 'invitation') {
    const invitation = await getInvitationByToken(pending.token);
    if (!invitation) {
      return err('この招待リンクは無効か、期限切れです');
    }

    // トークンだけを信用の起点にすると、トークンを入手した第三者が
    // 別アドレスのアカウントで組織に参加できてしまう。
    if (!email || email.toLowerCase() !== invitation.email.toLowerCase()) {
      return err('招待されたメールアドレスと一致しません');
    }

    const accepted = await acceptInvitation(
      invitation.id,
      userId,
      invitation.orgId,
      invitation.role,
      invitation.email,
    );

    if (!accepted.success) {
      return err(accepted.error);
    }

    return ok({ created: true });
  }

  const org = await createOrganizationWithOwner(userId, pending.orgName);
  if (!org.success) {
    return err(org.error);
  }

  return ok({ created: true });
}
