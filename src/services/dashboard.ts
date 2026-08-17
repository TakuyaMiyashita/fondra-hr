import { and, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { departments } from '@/db/schema/departments';
import { employeeSkills } from '@/db/schema/employee-skills';
import { employees } from '@/db/schema/employees';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { authUsers } from '@/db/schema/memberships';
import { skills } from '@/db/schema/skills';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type {
  DashboardStats,
  DepartmentHeadcount,
  EmployeeStatusCount,
  RecentActivity,
  SkillCategoryCount,
} from '@/types/dashboard';

export async function getDashboardStats(ctx: AuthContext): Promise<DashboardStats> {
  authorize(ctx, 'read', 'dashboard');

  const [empRow, deptRow, skillRow, cycleRow] = await Promise.all([
    db
      .select({ count: count() })
      .from(employees)
      .where(and(eq(employees.orgId, ctx.orgId), eq(employees.status, 'active'))),
    db.select({ count: count() }).from(departments).where(eq(departments.orgId, ctx.orgId)),
    db.select({ count: count() }).from(skills).where(eq(skills.orgId, ctx.orgId)),
    db
      .select({ count: count() })
      .from(evaluationCycles)
      .where(
        and(eq(evaluationCycles.orgId, ctx.orgId), eq(evaluationCycles.status, 'in_progress')),
      ),
  ]);

  return {
    employeeCount: empRow[0].count,
    departmentCount: deptRow[0].count,
    skillCount: skillRow[0].count,
    activeCycleCount: cycleRow[0].count,
  };
}

export async function getRecentActivity(ctx: AuthContext, limit = 10): Promise<RecentActivity[]> {
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

export async function getDepartmentHeadcounts(ctx: AuthContext): Promise<DepartmentHeadcount[]> {
  authorize(ctx, 'read', 'dashboard');

  const rows = await db
    .select({
      name: departments.name,
      count: count(employees.id),
    })
    .from(departments)
    .leftJoin(
      employees,
      and(eq(employees.departmentId, departments.id), eq(employees.status, 'active')),
    )
    .where(eq(departments.orgId, ctx.orgId))
    .groupBy(departments.name)
    .orderBy(desc(count(employees.id)));

  return rows;
}

export async function getSkillCategoryCounts(ctx: AuthContext): Promise<SkillCategoryCount[]> {
  authorize(ctx, 'read', 'dashboard');

  const categoryCol = sql<string>`coalesce(${skills.category}, '未分類')`;

  const rows = await db
    .select({
      category: categoryCol,
      count: count(employeeSkills.id),
    })
    .from(skills)
    .innerJoin(employeeSkills, eq(employeeSkills.skillId, skills.id))
    .where(eq(skills.orgId, ctx.orgId))
    .groupBy(categoryCol)
    .orderBy(desc(count(employeeSkills.id)));

  return rows as SkillCategoryCount[];
}

export async function getEmployeeStatusCounts(ctx: AuthContext): Promise<EmployeeStatusCount[]> {
  authorize(ctx, 'read', 'dashboard');

  const rows = await db
    .select({
      status: employees.status,
      count: count(),
    })
    .from(employees)
    .where(eq(employees.orgId, ctx.orgId))
    .groupBy(employees.status);

  return rows;
}
