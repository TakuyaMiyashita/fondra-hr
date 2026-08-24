'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { uuidField } from '@/lib/validations/common';
import {
  createCycleSchema,
  createEvaluationSchema,
  updateCycleSchema,
  updateEvaluationSchema,
} from '@/lib/validations/evaluation';
import { AuthorizationError, authorizationMessage } from '@/services/authorize';
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

const cycleId = uuidField('評価サイクル');
const evaluationId = uuidField('評価');

export async function fetchCycleDetail(id: string): Promise<Result<CycleWithEvaluations>> {
  const parsed = cycleId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    return await getCycleSvc(ctx, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function deleteCycleAction(id: string): Promise<Result<void>> {
  const parsed = cycleId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await deleteCycleSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function deleteEvaluationAction(id: string): Promise<Result<void>> {
  const parsed = evaluationId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await deleteEvalSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/evaluations');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
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
