'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
  type EmployeeListQuery,
} from '@/lib/validations/employee';
import {
  createEmployee as createEmployeeSvc,
  deleteEmployee as deleteEmployeeSvc,
  getEmployee as getEmployeeSvc,
  getDepartmentsForOrg as getDepartmentsSvc,
  getEmployeeEvaluations as getEvaluationsSvc,
  getEmployeeOneOnOnes as getOneOnOnesSvc,
  getEmployeeSkills as getSkillsSvc,
  listEmployees as listEmployeesSvc,
  updateEmployee as updateEmployeeSvc,
  updateEmployeeAvatar as updateEmployeeAvatarSvc,
} from '@/services/employee';
import { AuthorizationError } from '@/services/authorize';
import type {
  DepartmentOption,
  EmployeeDetail,
  EmployeeListResult,
  EmployeeSkillRow,
  EvaluationRow,
  OneOnOneRow,
} from '@/types/employee';

export async function fetchEmployees(
  query: EmployeeListQuery,
): Promise<Result<EmployeeListResult>> {
  const parsed = employeeListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await listEmployeesSvc(ctx, parsed.data);
    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function fetchEmployee(
  id: string,
): Promise<Result<EmployeeDetail>> {
  try {
    const ctx = await getAuthContext();
    return await getEmployeeSvc(ctx, id);
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function createEmployeeAction(
  data: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = createEmployeeSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createEmployeeSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/employees');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function updateEmployeeAction(
  data: unknown,
): Promise<Result<void>> {
  const parsed = updateEmployeeSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const { id, ...fields } = parsed.data;

  try {
    const ctx = await getAuthContext();
    const result = await updateEmployeeSvc(ctx, id, fields);
    if (result.success) {
      revalidatePath('/employees');
      revalidatePath(`/employees/${id}`);
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function deleteEmployeeAction(
  id: string,
): Promise<Result<void>> {
  try {
    const ctx = await getAuthContext();
    const result = await deleteEmployeeSvc(ctx, id);
    if (result.success) {
      revalidatePath('/employees');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

const ALLOWED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadAvatarAction(
  employeeId: string,
  formData: FormData,
): Promise<Result<{ path: string }>> {
  try {
    const ctx = await getAuthContext();
    const file = formData.get('file') as File | null;
    if (!file) return err('ファイルが選択されていません');

    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_AVATAR_EXTENSIONS.includes(ext)) {
      return err('許可されていないファイル形式です（jpg, png, webp のみ）');
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return err('ファイルサイズが大きすぎます（最大5MB）');
    }

    const storagePath = `${ctx.orgId}/${employeeId}/avatar.${ext}`;

    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) return err(`アップロードに失敗しました: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(storagePath);

    const result = await updateEmployeeAvatarSvc(ctx, employeeId, urlData.publicUrl);
    if (!result.success) return result;

    revalidatePath(`/employees/${employeeId}`);
    return ok({ path: urlData.publicUrl });
  } catch (e) {
    if (e instanceof AuthorizationError) return err('権限がありません');
    throw e;
  }
}

export async function fetchDepartments(): Promise<DepartmentOption[]> {
  try {
    const ctx = await getAuthContext();
    return await getDepartmentsSvc(ctx);
  } catch {
    return [];
  }
}

export async function fetchEmployeeSkills(
  employeeId: string,
): Promise<EmployeeSkillRow[]> {
  try {
    const ctx = await getAuthContext();
    return await getSkillsSvc(ctx, employeeId);
  } catch {
    return [];
  }
}

export async function fetchEmployeeOneOnOnes(
  employeeId: string,
): Promise<OneOnOneRow[]> {
  try {
    const ctx = await getAuthContext();
    return await getOneOnOnesSvc(ctx, employeeId);
  } catch {
    return [];
  }
}

export async function fetchEmployeeEvaluations(
  employeeId: string,
): Promise<EvaluationRow[]> {
  try {
    const ctx = await getAuthContext();
    return await getEvaluationsSvc(ctx, employeeId);
  } catch {
    return [];
  }
}
