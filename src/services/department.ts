import { and, asc, count, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { departments } from '@/db/schema/departments';
import { employees } from '@/db/schema/employees';
import { type Result, err, ok } from '@/lib/result';
import type { CreateDepartmentInput } from '@/lib/validations/department';
import type { AuthContext } from '@/services/auth-context';
import { authorize, hasMinRole } from '@/services/authorize';
import type { Department, DepartmentTreeNode } from '@/types/department';

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
    resourceType: 'department',
    resourceId,
    changes: changes ?? null,
  });
}

export async function listDepartments(
  ctx: AuthContext,
): Promise<Department[]> {
  authorize(ctx, 'read', 'department');

  return db
    .select({
      id: departments.id,
      name: departments.name,
      parentId: departments.parentId,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
    })
    .from(departments)
    .where(eq(departments.orgId, ctx.orgId))
    .orderBy(asc(departments.name));
}

export async function getDepartmentTree(
  ctx: AuthContext,
): Promise<DepartmentTreeNode[]> {
  authorize(ctx, 'read', 'department');

  const [allDepts, empCounts] = await Promise.all([
    db
      .select({
        id: departments.id,
        name: departments.name,
        parentId: departments.parentId,
        createdAt: departments.createdAt,
        updatedAt: departments.updatedAt,
      })
      .from(departments)
      .where(eq(departments.orgId, ctx.orgId))
      .orderBy(asc(departments.name)),
    db
      .select({
        departmentId: employees.departmentId,
        count: count(),
      })
      .from(employees)
      .where(eq(employees.orgId, ctx.orgId))
      .groupBy(employees.departmentId),
  ]);

  const countMap = new Map(
    empCounts
      .filter((e) => e.departmentId !== null)
      .map((e) => [e.departmentId!, e.count]),
  );

  const nodeMap = new Map<string, DepartmentTreeNode>();
  for (const dept of allDepts) {
    nodeMap.set(dept.id, {
      ...dept,
      children: [],
      employeeCount: countMap.get(dept.id) ?? 0,
    });
  }

  const roots: DepartmentTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getDepartment(
  ctx: AuthContext,
  id: string,
): Promise<Result<Department>> {
  authorize(ctx, 'read', 'department');

  const [row] = await db
    .select({
      id: departments.id,
      name: departments.name,
      parentId: departments.parentId,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
    })
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, ctx.orgId)))
    .limit(1);

  if (!row) {
    return err('部署が見つかりません');
  }

  return ok(row);
}

export async function createDepartment(
  ctx: AuthContext,
  input: CreateDepartmentInput,
): Promise<Result<{ id: string }>> {
  authorize(ctx, 'create', 'department', (c) => hasMinRole(c, 'admin'));

  if (input.parentId) {
    const [parent] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(eq(departments.id, input.parentId), eq(departments.orgId, ctx.orgId)),
      )
      .limit(1);

    if (!parent) {
      return err('親部署が見つかりません');
    }
  }

  const [created] = await db
    .insert(departments)
    .values({
      name: input.name,
      parentId: input.parentId || null,
      orgId: ctx.orgId,
    })
    .returning({ id: departments.id });

  await writeAuditLog(ctx, 'department.create', created.id, {
    name: input.name,
    parentId: input.parentId || null,
  });

  return ok({ id: created.id });
}

export async function updateDepartment(
  ctx: AuthContext,
  id: string,
  input: Partial<CreateDepartmentInput>,
): Promise<Result<void>> {
  authorize(ctx, 'update', 'department', (c) => hasMinRole(c, 'admin'));

  const [current] = await db
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, ctx.orgId)))
    .limit(1);

  if (!current) {
    return err('部署が見つかりません');
  }

  if (input.parentId === id) {
    return err('自分自身を親部署にすることはできません');
  }

  if (input.parentId) {
    const isDescendant = await checkIsDescendant(ctx.orgId, input.parentId, id);
    if (isDescendant) {
      return err('子孫部署を親部署にすることはできません');
    }
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined && input.name !== current.name) {
    changes.name = { from: current.name, to: input.name };
    updateData.name = input.name;
  }

  const newParentId = input.parentId === '' ? null : input.parentId;
  if (newParentId !== undefined && newParentId !== current.parentId) {
    changes.parentId = { from: current.parentId, to: newParentId };
    updateData.parentId = newParentId;
  }

  if (Object.keys(changes).length === 0) {
    return ok(undefined);
  }

  await db
    .update(departments)
    .set(updateData)
    .where(and(eq(departments.id, id), eq(departments.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'department.update', id, changes);

  return ok(undefined);
}

async function checkIsDescendant(
  orgId: string,
  targetId: string,
  ancestorId: string,
): Promise<boolean> {
  const allDepts = await db
    .select({ id: departments.id, parentId: departments.parentId })
    .from(departments)
    .where(eq(departments.orgId, orgId));

  const parentMap = new Map(allDepts.map((d) => [d.id, d.parentId]));

  let current: string | null = targetId;
  const visited = new Set<string>();

  while (current) {
    if (current === ancestorId) return true;
    if (visited.has(current)) break;
    visited.add(current);
    current = parentMap.get(current) ?? null;
  }

  return false;
}

export async function deleteDepartment(
  ctx: AuthContext,
  id: string,
): Promise<Result<void>> {
  authorize(ctx, 'delete', 'department', (c) => hasMinRole(c, 'admin'));

  const [target] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, ctx.orgId)))
    .limit(1);

  if (!target) {
    return err('部署が見つかりません');
  }

  const [childCount] = await db
    .select({ count: count() })
    .from(departments)
    .where(and(eq(departments.parentId, id), eq(departments.orgId, ctx.orgId)));

  if (childCount.count > 0) {
    return err('子部署が存在するため削除できません。先に子部署を移動または削除してください');
  }

  const [empCount] = await db
    .select({ count: count() })
    .from(employees)
    .where(and(eq(employees.departmentId, id), eq(employees.orgId, ctx.orgId)));

  if (empCount.count > 0) {
    return err('所属する従業員が存在するため削除できません。先に従業員の部署を変更してください');
  }

  await db
    .delete(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, ctx.orgId)));

  await writeAuditLog(ctx, 'department.delete', id, { name: target.name });

  return ok(undefined);
}
