import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { departments } from '@/db/schema/departments';
import { employeeSkills } from '@/db/schema/employee-skills';
import { employees } from '@/db/schema/employees';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { evaluations } from '@/db/schema/evaluations';
import { oneOnOnes } from '@/db/schema/one-on-ones';
import { skills } from '@/db/schema/skills';
import { type Result, err, ok } from '@/lib/result';
import type { CreateEmployeeInput, EmployeeListQuery } from '@/lib/validations/employee';
import type { AuthContext } from '@/services/auth-context';
import { authorize, hasMinRole } from '@/services/authorize';
import type {
  DepartmentOption,
  Employee,
  EmployeeDetail,
  EmployeeListResult,
  EmployeeSkillRow,
  EvaluationRow,
  OneOnOneRow,
} from '@/types/employee';

async function writeAuditLog(
  ctx: AuthContext,
  action: string,
  resourceId: string | null,
  changes?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action,
    resourceType: 'employee',
    resourceId,
    changes: changes ?? null,
  });
}

export async function listEmployees(
  ctx: AuthContext,
  query: EmployeeListQuery,
): Promise<EmployeeListResult> {
  authorize(ctx, 'read', 'employee');

  const conditions = [eq(employees.orgId, ctx.orgId)];

  if (query.status) {
    conditions.push(eq(employees.status, query.status));
  }
  if (query.departmentId) {
    conditions.push(eq(employees.departmentId, query.departmentId));
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(employees.fullName, pattern),
        ilike(employees.fullNameKana, pattern),
        ilike(employees.employeeCode, pattern),
        ilike(employees.email, pattern),
      )!,
    );
  }

  const where = and(...conditions);

  const sortColumnMap = {
    employeeCode: employees.employeeCode,
    fullName: employees.fullName,
    email: employees.email,
    position: employees.position,
    hiredOn: employees.hiredOn,
    status: employees.status,
    createdAt: employees.createdAt,
  } as const;

  const sortCol = sortColumnMap[query.sort];
  const orderFn = query.order === 'asc' ? asc : desc;

  const offset = (query.page - 1) * query.perPage;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        fullNameKana: employees.fullNameKana,
        email: employees.email,
        position: employees.position,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        hiredOn: employees.hiredOn,
        status: employees.status,
        avatarPath: employees.avatarPath,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(query.perPage)
      .offset(offset),
    db.select({ total: count() }).from(employees).where(where),
  ]);

  return {
    employees: rows as Employee[],
    total,
  };
}

export async function getEmployee(
  ctx: AuthContext,
  id: string,
): Promise<Result<EmployeeDetail>> {
  authorize(ctx, 'read', 'employee');

  const [row] = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      fullNameKana: employees.fullNameKana,
      email: employees.email,
      position: employees.position,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      hiredOn: employees.hiredOn,
      birthDate: employees.birthDate,
      status: employees.status,
      avatarPath: employees.avatarPath,
      userId: employees.userId,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!row) {
    return err('従業員が見つかりません');
  }

  return ok(row as EmployeeDetail);
}

function cleanInput(input: CreateEmployeeInput) {
  return {
    employeeCode: input.employeeCode,
    fullName: input.fullName,
    fullNameKana: input.fullNameKana || null,
    email: input.email || null,
    departmentId: input.departmentId || null,
    position: input.position || null,
    hiredOn: input.hiredOn || null,
    birthDate: input.birthDate || null,
    status: input.status,
  };
}

export async function createEmployee(
  ctx: AuthContext,
  input: CreateEmployeeInput,
): Promise<Result<{ id: string }>> {
  authorize(ctx, 'create', 'employee');

  const data = cleanInput(input);

  const existing = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.orgId, ctx.orgId),
        eq(employees.employeeCode, data.employeeCode),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return err('この社員番号は既に使用されています');
  }

  const [created] = await db
    .insert(employees)
    .values({ ...data, orgId: ctx.orgId })
    .returning({ id: employees.id });

  await writeAuditLog(ctx, 'employee.create', created.id, data);

  return ok({ id: created.id });
}

export async function updateEmployee(
  ctx: AuthContext,
  id: string,
  input: Partial<CreateEmployeeInput>,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'employee');

  const [current] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!current) {
    return err('従業員が見つかりません');
  }

  if (input.employeeCode && input.employeeCode !== current.employeeCode) {
    const dup = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.orgId, ctx.orgId),
          eq(employees.employeeCode, input.employeeCode),
        ),
      )
      .limit(1);

    if (dup.length > 0) {
      return err('この社員番号は既に使用されています');
    }
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const cleaned = typeof value === 'string' && value === '' ? null : value;
    const currentVal = current[key as keyof typeof current];
    if (cleaned !== currentVal) {
      changes[key] = { from: currentVal, to: cleaned };
      updateData[key] = cleaned;
    }
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  await db
    .update(employees)
    .set(updateData)
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'employee.update', id, changes);

  return ok(undefined);
}

export async function deleteEmployee(
  ctx: AuthContext,
  id: string,
): Promise<Result<void>> {
  authorize(ctx, 'delete', 'employee', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('従業員が見つかりません');
  }

  await db
    .delete(employees)
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'employee.delete', id, { fullName: target.fullName });

  return ok(undefined);
}

export async function getEmployeeSkills(
  ctx: AuthContext,
  employeeId: string,
): Promise<EmployeeSkillRow[]> {
  authorize(ctx, 'read', 'employee');

  return db
    .select({
      id: employeeSkills.id,
      skillId: employeeSkills.skillId,
      skillName: skills.name,
      skillCategory: skills.category,
      level: employeeSkills.level,
      certifiedAt: employeeSkills.certifiedAt,
    })
    .from(employeeSkills)
    .innerJoin(skills, eq(employeeSkills.skillId, skills.id))
    .where(
      and(
        eq(employeeSkills.employeeId, employeeId),
        eq(employeeSkills.orgId, ctx.orgId),
      ),
    )
    .orderBy(asc(skills.name));
}

export async function getEmployeeOneOnOnes(
  ctx: AuthContext,
  employeeId: string,
): Promise<OneOnOneRow[]> {
  authorize(ctx, 'read', 'employee');

  const interviewer = db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .as('interviewer');

  return db
    .select({
      id: oneOnOnes.id,
      heldOn: oneOnOnes.heldOn,
      interviewerName: sql<string>`${interviewer.fullName}`,
      notes: oneOnOnes.notes,
      aiSummary: oneOnOnes.aiSummary,
      moodScore: oneOnOnes.moodScore,
    })
    .from(oneOnOnes)
    .innerJoin(interviewer, eq(oneOnOnes.interviewerId, interviewer.id))
    .where(
      and(
        eq(oneOnOnes.employeeId, employeeId),
        eq(oneOnOnes.orgId, ctx.orgId),
      ),
    )
    .orderBy(desc(oneOnOnes.heldOn));
}

export async function getEmployeeEvaluations(
  ctx: AuthContext,
  employeeId: string,
): Promise<EvaluationRow[]> {
  authorize(ctx, 'read', 'employee');

  const evaluator = db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .as('evaluator');

  return db
    .select({
      id: evaluations.id,
      cycleName: evaluationCycles.name,
      evaluatorName: sql<string>`${evaluator.fullName}`,
      status: evaluations.status,
      comment: evaluations.comment,
      createdAt: evaluations.createdAt,
    })
    .from(evaluations)
    .innerJoin(evaluationCycles, eq(evaluations.cycleId, evaluationCycles.id))
    .innerJoin(evaluator, eq(evaluations.evaluatorId, evaluator.id))
    .where(
      and(
        eq(evaluations.employeeId, employeeId),
        eq(evaluations.orgId, ctx.orgId),
      ),
    )
    .orderBy(desc(evaluations.createdAt));
}

export async function getDepartmentsForOrg(
  ctx: AuthContext,
): Promise<DepartmentOption[]> {
  authorize(ctx, 'read', 'employee');

  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.orgId, ctx.orgId))
    .orderBy(asc(departments.name));
}
