import { and, asc, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { authUsers } from '@/db/schema/memberships';
import type { AuditLogListQuery } from '@/lib/validations/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type { AuditLog, AuditLogListResult } from '@/types/audit-log';

/**
 * 監査ログに値を残さないフィールド。
 *
 * 監査ログは全ロールが読める（docs/database/authorization-matrix.md）。
 * 一方これらは行単位・フィールド単位の可視制御で特定の相手にしか
 * 見せていない値であり（src/services/field-visibility.ts、
 * src/services/self.ts）、変更内容として素通しで書くと
 * viewer が監査ログ画面を開くだけで全部読めてしまう。
 *
 * 監査ログに要るのは「誰がいつ何を変えたか」であって、変更後の値ではない。
 * フィールド名と変更があった事実だけを残し、値は伏せる。
 */
const REDACTED_FIELDS = new Set(['birthDate', 'notes', 'comment', 'aiSummary', 'ratings']);

/** 伏せた値の表示。UI はこの文字列をそのまま描画する。 */
export const REDACTED = '（記録しない）';

/**
 * 機微フィールドの値を伏せる。`{ from, to }` 形式と素の値の両方を受ける。
 *
 * キーの集合は変えないので、変更されたフィールド名と項目数は監査ログに残る。
 */
function redact(changes: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    if (!REDACTED_FIELDS.has(key)) {
      result[key] = value;
      continue;
    }

    const isChangePair =
      typeof value === 'object' && value !== null && 'from' in value && 'to' in value;

    result[key] = isChangePair ? { from: REDACTED, to: REDACTED } : REDACTED;
  }

  return result;
}

export async function writeAuditLog(
  ctx: AuthContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  changes?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action,
    resourceType,
    resourceId,
    changes: changes ? redact(changes) : null,
  });
}

export async function listAuditLogs(
  ctx: AuthContext,
  query: AuditLogListQuery,
): Promise<AuditLogListResult> {
  authorize(ctx, 'read', 'audit_log');

  const conditions = [eq(auditLogs.orgId, ctx.orgId)];

  if (query.resourceType) {
    conditions.push(eq(auditLogs.resourceType, query.resourceType));
  }

  if (query.action) {
    conditions.push(eq(auditLogs.action, query.action));
  }

  const where = and(...conditions);

  const [totalRow] = await db.select({ count: count() }).from(auditLogs).where(where);

  const offset = (query.page - 1) * query.perPage;
  const orderFn = query.order === 'asc' ? asc : desc;

  const rows = await db
    .select({
      id: auditLogs.id,
      actorEmail: authUsers.email,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      changes: auditLogs.changes,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(authUsers, eq(auditLogs.actorUserId, authUsers.id))
    .where(where)
    // createdAt は一意ではない（同一トランザクションの一括操作で同値になる）。
    // タイブレーカーが無いとページ間で行の重複・欠落が起きるため id を併用する。
    .orderBy(orderFn(auditLogs.createdAt), asc(auditLogs.id))
    .limit(query.perPage)
    .offset(offset);

  return {
    logs: rows as AuditLog[],
    total: totalRow.count,
  };
}

export async function getResourceTypes(ctx: AuthContext): Promise<string[]> {
  authorize(ctx, 'read', 'audit_log');

  const rows = await db
    .selectDistinct({ resourceType: auditLogs.resourceType })
    .from(auditLogs)
    .where(eq(auditLogs.orgId, ctx.orgId))
    .orderBy(asc(auditLogs.resourceType));

  return rows.map((r) => r.resourceType);
}
