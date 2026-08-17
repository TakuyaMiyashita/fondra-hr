import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { employees } from '@/db/schema/employees';
import { oneOnOnes } from '@/db/schema/one-on-ones';
import { type Result, err, ok } from '@/lib/result';
import type {
  CreateOneOnOneInput,
  OneOnOneListQuery,
  UpdateOneOnOneInput,
} from '@/lib/validations/one-on-one';
import { writeAuditLog } from '@/services/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type {
  EmployeeOption,
  OneOnOne,
  OneOnOneDetail,
  OneOnOneListResult,
} from '@/types/one-on-one';

const employee = (alias: string) =>
  db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
    })
    .from(employees)
    .as(alias);

export async function listOneOnOnes(
  ctx: AuthContext,
  query: OneOnOneListQuery,
): Promise<OneOnOneListResult> {
  authorize(ctx, 'read', 'one_on_one');

  const emp = employee('emp');
  const interviewer = employee('interviewer');

  const conditions = [eq(oneOnOnes.orgId, ctx.orgId)];

  if (query.employeeId) {
    conditions.push(eq(oneOnOnes.employeeId, query.employeeId));
  }
  if (query.interviewerId) {
    conditions.push(eq(oneOnOnes.interviewerId, query.interviewerId));
  }
  if (query.search) {
    conditions.push(
      or(
        ilike(sql`${emp.fullName}`, `%${query.search}%`),
        ilike(sql`${interviewer.fullName}`, `%${query.search}%`),
      )!,
    );
  }

  const where = and(...conditions);

  const [totalRow] = await db
    .select({ count: count() })
    .from(oneOnOnes)
    .innerJoin(emp, eq(oneOnOnes.employeeId, emp.id))
    .innerJoin(interviewer, eq(oneOnOnes.interviewerId, interviewer.id))
    .where(where);

  const offset = (query.page - 1) * query.perPage;
  const orderCol = query.sort === 'heldOn' ? oneOnOnes.heldOn : oneOnOnes.createdAt;
  const orderFn = query.order === 'asc' ? asc : desc;

  const rows = await db
    .select({
      id: oneOnOnes.id,
      employeeId: oneOnOnes.employeeId,
      employeeName: sql<string>`${emp.fullName}`,
      employeeCode: sql<string>`${emp.employeeCode}`,
      interviewerId: oneOnOnes.interviewerId,
      interviewerName: sql<string>`${interviewer.fullName}`,
      heldOn: oneOnOnes.heldOn,
      notes: oneOnOnes.notes,
      aiSummary: oneOnOnes.aiSummary,
      moodScore: oneOnOnes.moodScore,
      createdAt: oneOnOnes.createdAt,
    })
    .from(oneOnOnes)
    .innerJoin(emp, eq(oneOnOnes.employeeId, emp.id))
    .innerJoin(interviewer, eq(oneOnOnes.interviewerId, interviewer.id))
    .where(where)
    // heldOn / createdAt は一意ではない。タイブレーカーが無いと
    // ページ間で行の重複・欠落が起きるため id を併用する。
    .orderBy(orderFn(orderCol), asc(oneOnOnes.id))
    .limit(query.perPage)
    .offset(offset);

  return {
    records: rows as OneOnOne[],
    total: totalRow.count,
  };
}

export async function getOneOnOne(ctx: AuthContext, id: string): Promise<Result<OneOnOneDetail>> {
  authorize(ctx, 'read', 'one_on_one');

  const emp = employee('emp');
  const interviewer = employee('interviewer');

  const [row] = await db
    .select({
      id: oneOnOnes.id,
      employeeId: oneOnOnes.employeeId,
      employeeName: sql<string>`${emp.fullName}`,
      employeeCode: sql<string>`${emp.employeeCode}`,
      interviewerId: oneOnOnes.interviewerId,
      interviewerName: sql<string>`${interviewer.fullName}`,
      heldOn: oneOnOnes.heldOn,
      notes: oneOnOnes.notes,
      aiSummary: oneOnOnes.aiSummary,
      moodScore: oneOnOnes.moodScore,
      createdAt: oneOnOnes.createdAt,
      updatedAt: oneOnOnes.updatedAt,
    })
    .from(oneOnOnes)
    .innerJoin(emp, eq(oneOnOnes.employeeId, emp.id))
    .innerJoin(interviewer, eq(oneOnOnes.interviewerId, interviewer.id))
    .where(and(eq(oneOnOnes.id, id), eq(oneOnOnes.orgId, ctx.orgId)))
    .limit(1);

  if (!row) {
    return err('1on1記録が見つかりません');
  }

  return ok(row as OneOnOneDetail);
}

export async function createOneOnOne(
  ctx: AuthContext,
  input: CreateOneOnOneInput,
): Promise<Result<{ id: string }>> {
  authorize(ctx, 'create', 'one_on_one');

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!emp) {
    return err('対象従業員が見つかりません');
  }

  const [inter] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, input.interviewerId), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!inter) {
    return err('面談者が見つかりません');
  }

  const [created] = await db
    .insert(oneOnOnes)
    .values({
      orgId: ctx.orgId,
      employeeId: input.employeeId,
      interviewerId: input.interviewerId,
      heldOn: input.heldOn,
      notes: input.notes || null,
      moodScore: input.moodScore || null,
    })
    .returning({ id: oneOnOnes.id });

  await writeAuditLog(ctx, 'one_on_one.create', 'one_on_one', created.id, {
    employeeId: input.employeeId,
    interviewerId: input.interviewerId,
    heldOn: input.heldOn,
  });

  return ok({ id: created.id });
}

export async function updateOneOnOne(
  ctx: AuthContext,
  input: UpdateOneOnOneInput,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'one_on_one');

  const [current] = await db
    .select()
    .from(oneOnOnes)
    .where(and(eq(oneOnOnes.id, input.id), eq(oneOnOnes.orgId, ctx.orgId)))
    .limit(1);

  if (!current) {
    return err('1on1記録が見つかりません');
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  const fields: [string, unknown, unknown][] = [
    ['employeeId', current.employeeId, input.employeeId],
    ['interviewerId', current.interviewerId, input.interviewerId],
    ['heldOn', current.heldOn, input.heldOn],
    ['notes', current.notes, input.notes || null],
    ['moodScore', current.moodScore, input.moodScore ?? null],
  ];

  for (const [key, from, to] of fields) {
    if (to !== undefined && String(from) !== String(to)) {
      changes[key] = { from, to };
      updateData[key] = to;
    }
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  await db
    .update(oneOnOnes)
    .set(updateData)
    .where(and(eq(oneOnOnes.id, input.id), eq(oneOnOnes.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'one_on_one.update', 'one_on_one', input.id, changes);

  return ok(undefined);
}

export async function deleteOneOnOne(ctx: AuthContext, id: string): Promise<Result<void>> {
  authorize(ctx, 'delete', 'one_on_one');

  const [target] = await db
    .select({ id: oneOnOnes.id })
    .from(oneOnOnes)
    .where(and(eq(oneOnOnes.id, id), eq(oneOnOnes.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('1on1記録が見つかりません');
  }

  await db.delete(oneOnOnes).where(and(eq(oneOnOnes.id, id), eq(oneOnOnes.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'one_on_one.delete', 'one_on_one', id);

  return ok(undefined);
}

export async function getEmployeesForOrg(ctx: AuthContext): Promise<EmployeeOption[]> {
  authorize(ctx, 'read', 'one_on_one');

  return db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
    })
    .from(employees)
    .where(and(eq(employees.orgId, ctx.orgId), eq(employees.status, 'active')))
    .orderBy(asc(employees.fullName));
}
