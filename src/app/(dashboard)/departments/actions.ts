'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { uuidField } from '@/lib/validations/common';
import {
  createDepartmentSchema,
  moveDepartmentSchema,
  updateDepartmentSchema,
} from '@/lib/validations/department';
import {
  createDepartment as createDepartmentSvc,
  deleteDepartment as deleteDepartmentSvc,
  getDepartmentTree as getDepartmentTreeSvc,
  listDepartments as listDepartmentsSvc,
  updateDepartment as updateDepartmentSvc,
} from '@/services/department';
import { AuthorizationError, authorizationMessage } from '@/services/authorize';
import type { Department, DepartmentTreeNode } from '@/types/department';

export async function fetchDepartmentTree(): Promise<Result<DepartmentTreeNode[]>> {
  try {
    const ctx = await getAuthContext();
    const tree = await getDepartmentTreeSvc(ctx);
    return ok(tree);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function fetchDepartmentList(): Promise<Result<Department[]>> {
  try {
    const ctx = await getAuthContext();
    const list = await listDepartmentsSvc(ctx);
    return ok(list);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function createDepartmentAction(data: unknown): Promise<Result<{ id: string }>> {
  const parsed = createDepartmentSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createDepartmentSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/departments');
      revalidatePath('/employees');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function updateDepartmentAction(data: unknown): Promise<Result<void>> {
  const parsed = updateDepartmentSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const { id, ...fields } = parsed.data;

  try {
    const ctx = await getAuthContext();
    const result = await updateDepartmentSvc(ctx, id, fields);
    if (result.success) {
      revalidatePath('/departments');
      revalidatePath('/employees');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function moveDepartmentAction(
  id: string,
  newParentId: string | null,
): Promise<Result<void>> {
  const parsed = moveDepartmentSchema.safeParse({ id, newParentId });
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await updateDepartmentSvc(ctx, parsed.data.id, {
      parentId: parsed.data.newParentId ?? '',
    });
    if (result.success) {
      revalidatePath('/departments');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

const departmentId = uuidField('部署');

export async function deleteDepartmentAction(id: string): Promise<Result<void>> {
  const parsed = departmentId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await deleteDepartmentSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/departments');
      revalidatePath('/employees');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}
