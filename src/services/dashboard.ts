import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { departments } from '@/db/schema/departments';
import { employees } from '@/db/schema/employees';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { authUsers } from '@/db/schema/memberships';
import { skills } from '@/db/schema/skills';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type { DashboardStats, RecentActivity } from '@/types/dashboard';

export async function getDashboardStats(
  ctx: AuthContext,
): Promise<DashboardStats> {
  authorize(ctx, 'read', 'dashboard');

  const [empRow, deptRow, skillRow, cycleRow] = await Promise.all([
    db
      .select({ count: count() })
      .from(employees)
      .where(and(eq(employees.orgId, ctx.orgId), eq(employees.status, 'active'))),
    db
      .select({ count: count() })
      .from(departments)
      .where(eq(departments.orgId, ctx.orgId)),
    db
      .select({ count: count() })
      .from(skills)
      .where(eq(skills.orgId, ctx.orgId)),
    db
      .select({ count: count() })
      .from(evaluationCycles)
      .where(
        and(
          eq(evaluationCycles.orgId, ctx.orgId),
          eq(evaluationCycles.status, 'in_progress'),
        ),
      ),
  ]);

  return {
    employeeCount: empRow[0].count,
    departmentCount: deptRow[0].count,
    skillCount: skillRow[0].count,
    activeCycleCount: cycleRow[0].count,
  };
}

export async function getRecentActivity(
  ctx: AuthContext,
  limit = 10,
): Promise<RecentActivity[]> {
  authorize(ctx, 'read', 'dashboard');

  const rows = await db
    .select({
      id: auditLogs.id,
      actorEmail: authUsers.email,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(authUsers, eq(auditLogs.actorUserId, authUsers.id))
    .where(eq(auditLogs.orgId, ctx.orgId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows as RecentActivity[];
}
