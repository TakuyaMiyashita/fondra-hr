'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import {
  createOneOnOneSchema,
  oneOnOneListQuerySchema,
  updateOneOnOneSchema,
  type OneOnOneListQuery,
} from '@/lib/validations/one-on-one';
import { AuthorizationError } from '@/services/authorize';
import {
  createOneOnOne as createSvc,
  deleteOneOnOne as deleteSvc,
  getEmployeesForOrg as getEmployeesSvc,
  listOneOnOnes as listSvc,
  updateOneOnOne as updateSvc,
} from '@/services/one-on-one';
import type { EmployeeOption, OneOnOneListResult } from '@/types/one-on-one';

export async function fetchOneOnOnes(
  query: OneOnOneListQuery,
): Promise<Result<OneOnOneListResult>> {
  const parsed = oneOnOneListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await listSvc(ctx, parsed.data);
    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function createOneOnOneAction(data: unknown): Promise<Result<{ id: string }>> {
  const parsed = createOneOnOneSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/one-on-ones');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function updateOneOnOneAction(data: unknown): Promise<Result<void>> {
  const parsed = updateOneOnOneSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await updateSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/one-on-ones');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function deleteOneOnOneAction(id: string): Promise<Result<void>> {
  try {
    const ctx = await getAuthContext();
    const result = await deleteSvc(ctx, id);
    if (result.success) {
      revalidatePath('/one-on-ones');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function fetchEmployeeOptions(): Promise<EmployeeOption[]> {
  try {
    const ctx = await getAuthContext();
    return await getEmployeesSvc(ctx);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}
