'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import {
  assignSkillSchema,
  createSkillSchema,
  skillListQuerySchema,
  skillMatrixQuerySchema,
  updateSkillSchema,
  type SkillListQuery,
  type SkillMatrixQuery,
} from '@/lib/validations/skill';
import { AuthorizationError } from '@/services/authorize';
import {
  assignSkill as assignSkillSvc,
  createSkill as createSkillSvc,
  deleteSkill as deleteSkillSvc,
  getCategories as getCategoriesSvc,
  getSkillMatrix as getSkillMatrixSvc,
  listSkills as listSkillsSvc,
  removeSkillAssignment as removeSkillAssignmentSvc,
  updateSkill as updateSkillSvc,
} from '@/services/skill';
import type { SkillListResult, SkillMatrixData } from '@/types/skill';

export async function fetchSkills(query: SkillListQuery): Promise<Result<SkillListResult>> {
  const parsed = skillListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await listSkillsSvc(ctx, parsed.data);
    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function createSkillAction(data: unknown): Promise<Result<{ id: string }>> {
  const parsed = createSkillSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createSkillSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/skills');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function updateSkillAction(data: unknown): Promise<Result<void>> {
  const parsed = updateSkillSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await updateSkillSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/skills');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function deleteSkillAction(id: string): Promise<Result<void>> {
  try {
    const ctx = await getAuthContext();
    const result = await deleteSkillSvc(ctx, id);
    if (result.success) {
      revalidatePath('/skills');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function fetchCategories(): Promise<string[]> {
  try {
    const ctx = await getAuthContext();
    return await getCategoriesSvc(ctx);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}

export async function fetchSkillMatrix(query: SkillMatrixQuery): Promise<Result<SkillMatrixData>> {
  const parsed = skillMatrixQuerySchema.safeParse(query);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await getSkillMatrixSvc(ctx, parsed.data);
    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function assignSkillAction(data: unknown): Promise<Result<void>> {
  const parsed = assignSkillSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await assignSkillSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/skills');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function removeSkillAssignmentAction(
  employeeId: string,
  skillId: string,
): Promise<Result<void>> {
  try {
    const ctx = await getAuthContext();
    const result = await removeSkillAssignmentSvc(ctx, employeeId, skillId);
    if (result.success) {
      revalidatePath('/skills');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}
