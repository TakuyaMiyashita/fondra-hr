'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import {
  createCycleSchema,
  createEvaluationSchema,
  updateCycleSchema,
  updateEvaluationSchema,
} from '@/lib/validations/evaluation';
import { AuthorizationError } from '@/services/authorize';
import {
  createCycle as createCycleSvc,
  createEvaluation as createEvalSvc,
  deleteCycle as deleteCycleSvc,
  deleteEvaluation as deleteEvalSvc,
  getCycle as getCycleSvc,
  listCycles as listCyclesSvc,
  updateCycle as updateCycleSvc,
  updateEvaluation as updateEvalSvc,
} from '@/services/evaluation';
import type { EmployeeOption } from '@/types/employee';
import type { CycleWithEvaluations, EvaluationCycle } from '@/types/evaluation';
import { getEmployeesForOrg } from '@/services/one-on-one';

export async function fetchCycles(): Promise<Result<EvaluationCycle[]>> {
  try {
    const ctx = await getAuthContext();
    const result = await listCyclesSvc(ctx);
    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function fetchCycleDetail(id: string): Promise<Result<CycleWithEvaluations>> {
  try {
    const ctx = await getAuthContext();
    return await getCycleSvc(ctx, id);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function createCycleAction(data: unknown): Promise<Result<{ id: string }>> {
  const parsed = createCycleSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createCycleSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function updateCycleAction(data: unknown): Promise<Result<void>> {
  const parsed = updateCycleSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await updateCycleSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function deleteCycleAction(id: string): Promise<Result<void>> {
  try {
    const ctx = await getAuthContext();
    const result = await deleteCycleSvc(ctx, id);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function createEvaluationAction(data: unknown): Promise<Result<{ id: string }>> {
  const parsed = createEvaluationSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createEvalSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function updateEvaluationAction(data: unknown): Promise<Result<void>> {
  const parsed = updateEvaluationSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await updateEvalSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function deleteEvaluationAction(id: string): Promise<Result<void>> {
  try {
    const ctx = await getAuthContext();
    const result = await deleteEvalSvc(ctx, id);
    if (result.success) {
      revalidatePath('/evaluations');
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
    return await getEmployeesForOrg(ctx);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}
