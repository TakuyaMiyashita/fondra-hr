import { and, asc, count, eq, ilike, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { departments } from '@/db/schema/departments';
import { employeeSkills } from '@/db/schema/employee-skills';
import { employees } from '@/db/schema/employees';
import { skills } from '@/db/schema/skills';
import { type Result, err, ok } from '@/lib/result';
import type {
  AssignSkillInput,
  CreateSkillInput,
  SkillListQuery,
  SkillMatrixQuery,
  UpdateSkillInput,
} from '@/lib/validations/skill';
import { writeAuditLog } from '@/services/audit-log';
import { isUniqueViolation } from '@/services/db-errors';
import type { AuthContext } from '@/services/auth-context';
import { authorize, hasMinRole } from '@/services/authorize';
import type {
  Skill,
  SkillListResult,
  SkillMatrixCell,
  SkillMatrixData,
  SkillMatrixEmployee,
  SkillWithCount,
} from '@/types/skill';

/** 事前チェックと一意制約違反の両方で使う。 */
const DUPLICATE_SKILL_NAME = 'このスキル名は既に使用されています';

export async function listSkills(
  ctx: AuthContext,
  query: SkillListQuery,
): Promise<SkillListResult> {
  authorize(ctx, 'read', 'skill');

  const conditions = [eq(skills.orgId, ctx.orgId)];

  if (query.search) {
    conditions.push(ilike(skills.name, `%${query.search}%`));
  }

  if (query.category) {
    conditions.push(eq(skills.category, query.category));
  }

  const where = and(...conditions);

  const [totalRow] = await db.select({ count: count() }).from(skills).where(where);

  const offset = (query.page - 1) * query.perPage;

  const rows = await db
    .select({
      id: skills.id,
      name: skills.name,
      category: skills.category,
      createdAt: skills.createdAt,
      updatedAt: skills.updatedAt,
      employeeCount: sql<number>`cast(count(${employeeSkills.id}) as int)`,
    })
    .from(skills)
    .leftJoin(employeeSkills, eq(skills.id, employeeSkills.skillId))
    .where(where)
    .groupBy(skills.id)
    .orderBy(asc(skills.name))
    .limit(query.perPage)
    .offset(offset);

  return {
    skills: rows as SkillWithCount[],
    total: totalRow.count,
  };
}

export async function getSkill(ctx: AuthContext, id: string): Promise<Result<Skill>> {
  authorize(ctx, 'read', 'skill');

  const [row] = await db
    .select({
      id: skills.id,
      name: skills.name,
      category: skills.category,
      createdAt: skills.createdAt,
      updatedAt: skills.updatedAt,
    })
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.orgId, ctx.orgId)))
    .limit(1);

  if (!row) {
    return err('スキルが見つかりません');
  }

  return ok(row as Skill);
}

export async function createSkill(
  ctx: AuthContext,
  input: CreateSkillInput,
): Promise<Result<{ id: string }>> {
  authorize(ctx, 'create', 'skill');

  const existing = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.orgId, ctx.orgId), eq(skills.name, input.name)))
    .limit(1);

  if (existing.length > 0) {
    return err(DUPLICATE_SKILL_NAME);
  }

  // 事前チェックと INSERT の間の競合は DB の一意制約でしか止まらない。
  let created: { id: string };
  try {
    [created] = await db
      .insert(skills)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        category: input.category || null,
      })
      .returning({ id: skills.id });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return err(DUPLICATE_SKILL_NAME);
    }
    throw e;
  }

  await writeAuditLog(ctx, 'skill.create', 'skill', created.id, {
    name: input.name,
    category: input.category || null,
  });

  return ok({ id: created.id });
}

export async function updateSkill(
  ctx: AuthContext,
  input: UpdateSkillInput,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'skill');

  const [current] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.id, input.id), eq(skills.orgId, ctx.orgId)))
    .limit(1);

  if (!current) {
    return err('スキルが見つかりません');
  }

  if (input.name !== current.name) {
    const dup = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.orgId, ctx.orgId), eq(skills.name, input.name)))
      .limit(1);

    if (dup.length > 0) {
      return err(DUPLICATE_SKILL_NAME);
    }
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const category = input.category || null;

  if (input.name !== current.name) {
    changes.name = { from: current.name, to: input.name };
  }
  if (category !== current.category) {
    changes.category = { from: current.category, to: category };
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  try {
    await db
      .update(skills)
      .set({ name: input.name, category, updatedAt: new Date() })
      .where(and(eq(skills.id, input.id), eq(skills.orgId, ctx.orgId)));
  } catch (e) {
    if (isUniqueViolation(e)) {
      return err(DUPLICATE_SKILL_NAME);
    }
    throw e;
  }

  await writeAuditLog(ctx, 'skill.update', 'skill', input.id, changes);

  return ok(undefined);
}

export async function deleteSkill(ctx: AuthContext, id: string): Promise<Result<void>> {
  authorize(ctx, 'delete', 'skill', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('スキルが見つかりません');
  }

  const [assigned] = await db
    .select({ count: count() })
    .from(employeeSkills)
    .where(and(eq(employeeSkills.skillId, id), eq(employeeSkills.orgId, ctx.orgId)));

  if (assigned.count > 0) {
    return err(`このスキルは ${assigned.count} 人の従業員に割り当てられているため削除できません`);
  }

  await db.delete(skills).where(and(eq(skills.id, id), eq(skills.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'skill.delete', 'skill', id, { name: target.name });

  return ok(undefined);
}

export async function getCategories(ctx: AuthContext): Promise<string[]> {
  authorize(ctx, 'read', 'skill');

  const rows = await db
    .selectDistinct({ category: skills.category })
    .from(skills)
    .where(and(eq(skills.orgId, ctx.orgId), sql`${skills.category} is not null`))
    .orderBy(asc(skills.category));

  return rows.map((r) => r.category!);
}

export async function getSkillMatrix(
  ctx: AuthContext,
  query: SkillMatrixQuery,
): Promise<SkillMatrixData> {
  authorize(ctx, 'read', 'skill');

  const empConditions = [eq(employees.orgId, ctx.orgId), eq(employees.status, 'active')];
  if (query.departmentId) {
    empConditions.push(eq(employees.departmentId, query.departmentId));
  }
  if (query.search) {
    empConditions.push(ilike(employees.fullName, `%${query.search}%`));
  }

  const matrixEmployees = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      departmentName: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(and(...empConditions))
    .orderBy(asc(employees.employeeCode));

  const skillConditions = [eq(skills.orgId, ctx.orgId)];
  if (query.category) {
    skillConditions.push(eq(skills.category, query.category));
  }

  const matrixSkills = await db
    .select({
      id: skills.id,
      name: skills.name,
      category: skills.category,
    })
    .from(skills)
    .where(and(...skillConditions))
    .orderBy(asc(skills.category), asc(skills.name));

  const employeeIds = matrixEmployees.map((e) => e.id);
  const skillIds = matrixSkills.map((s) => s.id);

  let cells: SkillMatrixCell[] = [];
  if (employeeIds.length > 0 && skillIds.length > 0) {
    cells = await db
      .select({
        employeeId: employeeSkills.employeeId,
        skillId: employeeSkills.skillId,
        level: employeeSkills.level,
        certifiedAt: employeeSkills.certifiedAt,
      })
      .from(employeeSkills)
      .where(
        and(
          eq(employeeSkills.orgId, ctx.orgId),
          // inArray を使う。sql`= any(${配列})` は Drizzle が配列を $1, $2, ... と
          // 個別のパラメータに展開するため any() が要求する配列にならず、
          // Postgres が 42809（op ANY/ALL (array) requires array on right side）で落ちる。
          inArray(employeeSkills.employeeId, employeeIds),
          inArray(employeeSkills.skillId, skillIds),
        ),
      );
  }

  const categories = [...new Set(matrixSkills.map((s) => s.category).filter(Boolean) as string[])];

  return {
    employees: matrixEmployees as SkillMatrixEmployee[],
    skills: matrixSkills,
    cells: cells as SkillMatrixCell[],
    categories,
  };
}

export async function assignSkill(
  ctx: AuthContext,
  input: AssignSkillInput,
): Promise<Result<void>> {
  authorize(ctx, 'create', 'employee_skill');

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, ctx.orgId)))
    .limit(1);

  if (!emp) {
    return err('従業員が見つかりません');
  }

  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.id, input.skillId), eq(skills.orgId, ctx.orgId)))
    .limit(1);

  if (!skill) {
    return err('スキルが見つかりません');
  }

  const [existing] = await db
    .select({ id: employeeSkills.id })
    .from(employeeSkills)
    .where(
      and(
        eq(employeeSkills.orgId, ctx.orgId),
        eq(employeeSkills.employeeId, input.employeeId),
        eq(employeeSkills.skillId, input.skillId),
      ),
    )
    .limit(1);

  const certifiedAt = input.certifiedAt || null;

  if (existing) {
    await db
      .update(employeeSkills)
      .set({
        level: input.level,
        certifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(employeeSkills.id, existing.id));

    await writeAuditLog(ctx, 'employee_skill.update', 'employee_skill', existing.id, {
      employeeId: input.employeeId,
      skillId: input.skillId,
      level: input.level,
    });
  } else {
    // 同じ従業員×スキルを同時に割り当てると unique(employee_id, skill_id) に
    // ぶつかる。割り当ては冪等でよいので、競合したら「更新された」と見なす。
    let created: { id: string };
    try {
      [created] = await db
        .insert(employeeSkills)
        .values({
          orgId: ctx.orgId,
          employeeId: input.employeeId,
          skillId: input.skillId,
          level: input.level,
          certifiedAt,
        })
        .returning({ id: employeeSkills.id });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return err('このスキルは既に割り当てられています。画面を更新してからやり直してください');
      }
      throw e;
    }

    await writeAuditLog(ctx, 'employee_skill.create', 'employee_skill', created.id, {
      employeeId: input.employeeId,
      skillId: input.skillId,
      level: input.level,
    });
  }

  return ok(undefined);
}

export async function removeSkillAssignment(
  ctx: AuthContext,
  employeeId: string,
  skillId: string,
): Promise<Result<void>> {
  authorize(ctx, 'delete', 'employee_skill');

  const [existing] = await db
    .select({ id: employeeSkills.id })
    .from(employeeSkills)
    .where(
      and(
        eq(employeeSkills.employeeId, employeeId),
        eq(employeeSkills.skillId, skillId),
        eq(employeeSkills.orgId, ctx.orgId),
      ),
    )
    .limit(1);

  if (!existing) {
    return err('スキル割り当てが見つかりません');
  }

  await db.delete(employeeSkills).where(eq(employeeSkills.id, existing.id));

  await writeAuditLog(ctx, 'employee_skill.delete', 'employee_skill', existing.id, {
    employeeId,
    skillId,
  });

  return ok(undefined);
}
