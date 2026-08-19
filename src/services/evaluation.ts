import { and, asc, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { employees } from '@/db/schema/employees';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { evaluations } from '@/db/schema/evaluations';
import { type Result, err, ok } from '@/lib/result';
import type {
  CreateCycleInput,
  CreateEvaluationInput,
  UpdateCycleInput,
  UpdateEvaluationInput,
} from '@/lib/validations/evaluation';
import { writeAuditLog } from '@/services/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize, hasMinRole } from '@/services/authorize';
import { getOwnEmployeeId } from '@/services/self';
import type {
  CycleWithEvaluations,
  Evaluation,
  EvaluationCycle,
  EvaluationCycleDetail,
} from '@/types/evaluation';

export async function listCycles(ctx: AuthContext): Promise<EvaluationCycle[]> {
  authorize(ctx, 'read', 'evaluation_cycle');

  const rows = await db
    .select({
      id: evaluationCycles.id,
      name: evaluationCycles.name,
      periodStart: evaluationCycles.periodStart,
      periodEnd: evaluationCycles.periodEnd,
      status: evaluationCycles.status,
      createdAt: evaluationCycles.createdAt,
      evaluationCount: sql<number>`cast(count(${evaluations.id}) as int)`,
    })
    .from(evaluationCycles)
    .leftJoin(evaluations, eq(evaluationCycles.id, evaluations.cycleId))
    .where(eq(evaluationCycles.orgId, ctx.orgId))
    .groupBy(evaluationCycles.id)
    .orderBy(desc(evaluationCycles.periodStart));

  return rows as EvaluationCycle[];
}

export async function getCycle(
  ctx: AuthContext,
  id: string,
): Promise<Result<CycleWithEvaluations>> {
  authorize(ctx, 'read', 'evaluation_cycle');

  const [cycleRow] = await db
    .select({
      id: evaluationCycles.id,
      name: evaluationCycles.name,
      periodStart: evaluationCycles.periodStart,
      periodEnd: evaluationCycles.periodEnd,
      status: evaluationCycles.status,
      createdAt: evaluationCycles.createdAt,
      updatedAt: evaluationCycles.updatedAt,
    })
    .from(evaluationCycles)
    .where(and(eq(evaluationCycles.id, id), eq(evaluationCycles.orgId, ctx.orgId)))
    .limit(1);

  if (!cycleRow) {
    return err('評価サイクルが見つかりません');
  }

  const emp = db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
    })
    .from(employees)
    .as('emp');

  const evaluator = db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
    })
    .from(employees)
    .as('evaluator');

  const evalRows = await db
    .select({
      id: evaluations.id,
      cycleId: evaluations.cycleId,
      employeeId: evaluations.employeeId,
      employeeName: sql<string>`${emp.fullName}`,
      employeeCode: sql<string>`${emp.employeeCode}`,
      evaluatorId: evaluations.evaluatorId,
      evaluatorName: sql<string>`${evaluator.fullName}`,
      ratings: evaluations.ratings,
      comment: evaluations.comment,
      status: evaluations.status,
      createdAt: evaluations.createdAt,
    })
    .from(evaluations)
    .innerJoin(emp, eq(evaluations.employeeId, emp.id))
    .innerJoin(evaluator, eq(evaluations.evaluatorId, evaluator.id))
    .where(and(eq(evaluations.cycleId, id), eq(evaluations.orgId, ctx.orgId)))
    .orderBy(asc(sql`${emp.employeeCode}`));

  return ok({
    cycle: cycleRow as EvaluationCycleDetail,
    evaluations: evalRows as Evaluation[],
  });
}

export async function createCycle(
  ctx: AuthContext,
  input: CreateCycleInput,
): Promise<Result<{ id: string }>> {
  authorize(ctx, 'create', 'evaluation_cycle', (c) => hasMinRole(c, 'admin'));

  const [created] = await db
    .insert(evaluationCycles)
    .values({
      orgId: ctx.orgId,
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    .returning({ id: evaluationCycles.id });

  await writeAuditLog(ctx, 'evaluation_cycle.create', 'evaluation_cycle', created.id, {
    name: input.name,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  return ok({ id: created.id });
}

export async function updateCycle(
  ctx: AuthContext,
  input: UpdateCycleInput,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'evaluation_cycle', (c) => hasMinRole(c, 'admin'));

  const [current] = await db
    .select()
    .from(evaluationCycles)
    .where(and(eq(evaluationCycles.id, input.id), eq(evaluationCycles.orgId, ctx.orgId)))
    .limit(1);

  if (!current) {
    return err('評価サイクルが見つかりません');
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const fields: [string, unknown, unknown][] = [
    ['name', current.name, input.name],
    ['periodStart', current.periodStart, input.periodStart],
    ['periodEnd', current.periodEnd, input.periodEnd],
    ['status', current.status, input.status],
  ];

  for (const [key, from, to] of fields) {
    if (String(from) !== String(to)) {
      changes[key] = { from, to };
    }
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  await db
    .update(evaluationCycles)
    .set({
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(and(eq(evaluationCycles.id, input.id), eq(evaluationCycles.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'evaluation_cycle.update', 'evaluation_cycle', input.id, changes);

  return ok(undefined);
}

export async function deleteCycle(ctx: AuthContext, id: string): Promise<Result<void>> {
  authorize(ctx, 'delete', 'evaluation_cycle', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: evaluationCycles.id, name: evaluationCycles.name })
    .from(evaluationCycles)
    .where(and(eq(evaluationCycles.id, id), eq(evaluationCycles.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('評価サイクルが見つかりません');
  }

  const [evalCount] = await db
    .select({ count: count() })
    .from(evaluations)
    .where(and(eq(evaluations.cycleId, id), eq(evaluations.orgId, ctx.orgId)));

  if (evalCount.count > 0) {
    return err(`この評価サイクルには ${evalCount.count} 件の評価が紐づいているため削除できません`);
  }

  await db
    .delete(evaluationCycles)
    .where(and(eq(evaluationCycles.id, id), eq(evaluationCycles.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'evaluation_cycle.delete', 'evaluation_cycle', id, {
    name: target.name,
  });

  return ok(undefined);
}

export async function createEvaluation(
  ctx: AuthContext,
  input: CreateEvaluationInput,
): Promise<Result<{ id: string }>> {
  authorize(ctx, 'create', 'evaluation');

  // member は自分が評価者の評価だけ作れる。ここを開けると、自分が評価者でない
  // 評価を勝手に起票できてしまう。
  if (!hasMinRole(ctx, 'admin')) {
    const ownId = await getOwnEmployeeId(ctx);
    if (!ownId || input.evaluatorId !== ownId) {
      return err('自分が評価者の評価のみ作成できます');
    }
  }

  const [cycle] = await db
    .select({ id: evaluationCycles.id })
    .from(evaluationCycles)
    .where(and(eq(evaluationCycles.id, input.cycleId), eq(evaluationCycles.orgId, ctx.orgId)))
    .limit(1);

  if (!cycle) {
    return err('評価サイクルが見つかりません');
  }

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!emp) {
    return err('対象従業員が見つかりません');
  }

  const [evaluator] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, input.evaluatorId), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!evaluator) {
    return err('評価者が見つかりません');
  }

  const existing = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(
      and(
        eq(evaluations.orgId, ctx.orgId),
        eq(evaluations.cycleId, input.cycleId),
        eq(evaluations.employeeId, input.employeeId),
        eq(evaluations.evaluatorId, input.evaluatorId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return err('この組み合わせの評価は既に存在します');
  }

  const [created] = await db
    .insert(evaluations)
    .values({
      orgId: ctx.orgId,
      cycleId: input.cycleId,
      employeeId: input.employeeId,
      evaluatorId: input.evaluatorId,
    })
    .returning({ id: evaluations.id });

  await writeAuditLog(ctx, 'evaluation.create', 'evaluation', created.id, {
    cycleId: input.cycleId,
    employeeId: input.employeeId,
    evaluatorId: input.evaluatorId,
  });

  return ok({ id: created.id });
}

export async function updateEvaluation(
  ctx: AuthContext,
  input: UpdateEvaluationInput,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'evaluation');

  const [current] = await db
    .select()
    .from(evaluations)
    .where(and(eq(evaluations.id, input.id), eq(evaluations.orgId, ctx.orgId)))
    .limit(1);

  if (!current) {
    return err('評価が見つかりません');
  }

  // member は自分が評価者の評価だけ編集できる。これが無いと被評価者本人が
  // 自分の評価点やコメントを書き換えられる。
  if (!hasMinRole(ctx, 'admin')) {
    const ownId = await getOwnEmployeeId(ctx);
    if (!ownId || current.evaluatorId !== ownId) {
      return err('自分が評価者の評価のみ編集できます');
    }
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (input.ratings !== undefined) {
    changes.ratings = { from: current.ratings, to: input.ratings };
    updateData.ratings = input.ratings;
  }
  if (input.comment !== undefined) {
    const newComment = input.comment || null;
    if (current.comment !== newComment) {
      changes.comment = { from: current.comment, to: newComment };
      updateData.comment = newComment;
    }
  }
  if (input.status !== undefined && input.status !== current.status) {
    changes.status = { from: current.status, to: input.status };
    updateData.status = input.status;
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  await db
    .update(evaluations)
    .set(updateData)
    .where(and(eq(evaluations.id, input.id), eq(evaluations.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'evaluation.update', 'evaluation', input.id, changes);

  return ok(undefined);
}

export async function deleteEvaluation(ctx: AuthContext, id: string): Promise<Result<void>> {
  authorize(ctx, 'delete', 'evaluation', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(and(eq(evaluations.id, id), eq(evaluations.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('評価が見つかりません');
  }

  await db.delete(evaluations).where(and(eq(evaluations.id, id), eq(evaluations.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'evaluation.delete', 'evaluation', id);

  return ok(undefined);
}
