import { and, asc, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { authUsers } from '@/db/schema/memberships';
import type { AuditLogListQuery } from '@/lib/validations/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type { AuditLog, AuditLogListResult } from '@/types/audit-log';

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
    changes: changes ?? null,
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

  const [totalRow] = await db
    .select({ count: count() })
    .from(auditLogs)
    .where(where);

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
    .orderBy(orderFn(auditLogs.createdAt))
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
