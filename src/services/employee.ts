import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { departments } from '@/db/schema/departments';
import { employeeSkills } from '@/db/schema/employee-skills';
import { employees } from '@/db/schema/employees';
import { authUsers, memberships } from '@/db/schema/memberships';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { evaluations } from '@/db/schema/evaluations';
import { oneOnOnes } from '@/db/schema/one-on-ones';
import { skills } from '@/db/schema/skills';
import { type Result, err, ok } from '@/lib/result';
import type { CreateEmployeeInput, EmployeeListQuery } from '@/lib/validations/employee';
import { writeAuditLog } from '@/services/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize, hasMinRole } from '@/services/authorize';
import {
  canReadBirthDate,
  canReadEvaluationComment,
  canReadPersonalData,
} from '@/services/field-visibility';
import { getOwnEmployeeId } from '@/services/self';
import type {
  DepartmentOption,
  Employee,
  EmployeeDetail,
  EmployeeListResult,
  EmployeeSkillRow,
  EvaluationRow,
  OneOnOneRow,
} from '@/types/employee';

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
      // ソート列は一意ではない（createdAt / status / position 等）。
      // タイブレーカーが無いとページ間で行の重複・欠落が起きるため id を併用する。
      .orderBy(orderFn(sortCol), asc(employees.id))
      .limit(query.perPage)
      .offset(offset),
    db.select({ total: count() }).from(employees).where(where),
  ]);

  return {
    employees: rows as Employee[],
    total,
  };
}

export async function getEmployee(ctx: AuthContext, id: string): Promise<Result<EmployeeDetail>> {
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

  // 生年月日は admin 以上と本人にだけ返す。従業員の read は全ロールに開いて
  // いるので、ここで落とさないと member / viewer に全員の生年月日が渡る。
  return ok({
    ...row,
    birthDate: canReadBirthDate(ctx, row.userId) ? row.birthDate : null,
  } as EmployeeDetail);
}

/**
 * 従業員レコードに紐付けるべきログインユーザーを、メールアドレスで解決する。
 *
 * 「このログインユーザーはどの従業員か」が分からないと、本人限定の操作
 * （自分が当事者の 1on1 だけ編集する等）を判定できない。招待フローは
 * アカウントのメールを招待レコードのメールに強制しているため、
 * メールアドレスがこのプロダクトでの実質的な結合キーになっている。
 *
 * 検索対象を「同じ組織のメンバー」に限定しているのが要。ここを
 * auth.users 全体にすると、他テナントのユーザーを自組織の従業員に
 * 紐付けられてしまう。
 *
 * 大文字小文字は無視する（ログイン時のメールは正規化されるが、
 * 従業員マスタ側は管理者の手入力で表記が揺れるため）。
 */
async function resolveLinkedUserId(orgId: string, email: string | null): Promise<string | null> {
  if (!email) return null;

  const [user] = await db
    .select({ id: authUsers.id })
    .from(memberships)
    .innerJoin(authUsers, eq(memberships.userId, authUsers.id))
    .where(and(eq(memberships.orgId, orgId), sql`lower(${authUsers.email}) = lower(${email})`))
    .limit(1);

  return user?.id ?? null;
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
  // 従業員レコードのメールアドレスはログインユーザーとの紐付けキーになる
  // （docs/database/authorization-matrix.md）。member が書き換えられると、
  // 任意の従業員レコードを「自分」に付け替えて本人限定の操作を奪えるため、
  // マスタ管理は admin 以上に限定する。
  authorize(ctx, 'create', 'employee', (c) => hasMinRole(c, 'admin'));

  const data = cleanInput(input);

  const existing = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.orgId, ctx.orgId), eq(employees.employeeCode, data.employeeCode)))
    .limit(1);

  if (existing.length > 0) {
    return err('この社員番号は既に使用されています');
  }

  const userId = await resolveLinkedUserId(ctx.orgId, data.email);

  const [created] = await db
    .insert(employees)
    .values({ ...data, orgId: ctx.orgId, userId })
    .returning({ id: employees.id });

  await writeAuditLog(ctx, 'employee.create', 'employee', created.id, data);

  return ok({ id: created.id });
}

export async function updateEmployee(
  ctx: AuthContext,
  id: string,
  input: Partial<CreateEmployeeInput>,
): Promise<Result<void>> {
  // create と同じ理由で admin 以上に限定する。
  authorize(ctx, 'update', 'employee', (c) => hasMinRole(c, 'admin'));

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
      .where(and(eq(employees.orgId, ctx.orgId), eq(employees.employeeCode, input.employeeCode)))
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

  // メールが変わったら紐付けを引き直す。一致するユーザーが居なくなった場合は
  // 解除する（古いメールのまま紐付けが残ると、別人の記録を「自分」として
  // 扱ってしまう）。メールを触っていない更新では紐付けに手を出さない。
  if ('email' in changes) {
    const userId = await resolveLinkedUserId(ctx.orgId, updateData.email as string | null);
    if (userId !== current.userId) {
      changes.userId = { from: current.userId, to: userId };
      updateData.userId = userId;
    }
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  await db
    .update(employees)
    .set(updateData)
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'employee.update', 'employee', id, changes);

  return ok(undefined);
}

export async function deleteEmployee(ctx: AuthContext, id: string): Promise<Result<void>> {
  authorize(ctx, 'delete', 'employee', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('従業員が見つかりません');
  }

  await db.delete(employees).where(and(eq(employees.id, id), eq(employees.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'employee.delete', 'employee', id, { fullName: target.fullName });

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
    .where(and(eq(employeeSkills.employeeId, employeeId), eq(employeeSkills.orgId, ctx.orgId)))
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
    .where(and(eq(oneOnOnes.employeeId, employeeId), eq(oneOnOnes.orgId, ctx.orgId)))
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

  const rows = await db
    .select({
      id: evaluations.id,
      cycleName: evaluationCycles.name,
      evaluatorId: evaluations.evaluatorId,
      evaluatorName: sql<string>`${evaluator.fullName}`,
      status: evaluations.status,
      comment: evaluations.comment,
      createdAt: evaluations.createdAt,
    })
    .from(evaluations)
    .innerJoin(evaluationCycles, eq(evaluations.cycleId, evaluationCycles.id))
    .innerJoin(evaluator, eq(evaluations.evaluatorId, evaluator.id))
    .where(and(eq(evaluations.employeeId, employeeId), eq(evaluations.orgId, ctx.orgId)))
    .orderBy(desc(evaluations.createdAt));

  // admin 以上は無条件に見えるので、紐付けの解決（追加クエリ）を省く。
  const ownEmployeeId = canReadPersonalData(ctx) ? null : await getOwnEmployeeId(ctx);

  // evaluatorId は判定にだけ使い、呼び出し側には返さない。
  return rows.map((row) => ({
    id: row.id,
    cycleName: row.cycleName,
    evaluatorName: row.evaluatorName,
    status: row.status,
    comment: canReadEvaluationComment(ctx, row.evaluatorId, ownEmployeeId) ? row.comment : null,
    createdAt: row.createdAt,
  }));
}

export async function updateEmployeeAvatar(
  ctx: AuthContext,
  employeeId: string,
  avatarPath: string,
): Promise<Result<void>> {
  // アバターも従業員マスタの一部。更新権限は他のフィールドと揃える。
  authorize(ctx, 'update', 'employee', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('従業員が見つかりません');
  }

  await db
    .update(employees)
    .set({ avatarPath, updatedAt: new Date() })
    .where(and(eq(employees.id, employeeId), eq(employees.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'employee.avatar_update', 'employee', employeeId, { avatarPath });

  return ok(undefined);
}

export async function getDepartmentsForOrg(ctx: AuthContext): Promise<DepartmentOption[]> {
  authorize(ctx, 'read', 'employee');

  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.orgId, ctx.orgId))
    .orderBy(asc(departments.name));
}
