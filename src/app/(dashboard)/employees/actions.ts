'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { uuidField } from '@/lib/validations/common';
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
  anonymizeEmployee as anonymizeEmployeeSvc,
  assertCanUpdateAvatar as assertCanUpdateAvatarSvc,
  updateEmployeeAvatar as updateEmployeeAvatarSvc,
} from '@/services/employee';
import { AuthorizationError, authorizationMessage } from '@/services/authorize';
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

const employeeId = uuidField('従業員');

export async function fetchEmployee(id: string): Promise<Result<EmployeeDetail>> {
  const parsed = employeeId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    return await getEmployeeSvc(ctx, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function createEmployeeAction(data: unknown): Promise<Result<{ id: string }>> {
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function updateEmployeeAction(data: unknown): Promise<Result<void>> {
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
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function deleteEmployeeAction(id: string): Promise<Result<void>> {
  const parsed = employeeId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await deleteEmployeeSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/employees');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

/**
 * 個人情報を落として従業員レコードだけ残す。
 *
 * 評価や 1on1 が紐づいた従業員は削除できない（他人の記録まで消えるため）。
 * それでも個人情報の削除請求には応える必要があるので、こちらで受ける。
 *
 * **アバターの削除を先に行う。** DB を先に更新すると、Storage の削除に
 * 失敗したときに「匿名化済みなのに顔写真は残っている」状態になる。
 * 順序を逆にしておけば、失敗しても匿名化されていない状態で止まる。
 * Storage への操作は Service Layer の外なので、権限は手前で確かめる。
 */
export async function anonymizeEmployeeAction(id: string): Promise<Result<void>> {
  const parsed = employeeId.safeParse(id);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();

    const allowed = await assertCanUpdateAvatarSvc(ctx, parsed.data);
    if (!allowed.success) return allowed;

    // 拡張子は登録時のファイル名で決まるため、パスを組み立てずに
    // フォルダごと列挙して消す。差し替えの残骸も一緒に落ちる。
    const supabase = await createClient();
    const folder = `${ctx.orgId}/${parsed.data}`;
    const { data: files } = await supabase.storage.from('avatars').list(folder);
    if (files && files.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('avatars')
        .remove(files.map((f) => `${folder}/${f.name}`));
      if (removeError) {
        return err(`アバターの削除に失敗しました: ${removeError.message}`);
      }
    }

    const result = await anonymizeEmployeeSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/employees');
      revalidatePath(`/employees/${parsed.data}`);
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
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

    // Storage への書き込みは Service Layer の外で起きるため、
    // 先に権限を確かめる。updateEmployeeAvatarSvc は後段にあり、
    // そこまで待つとファイルだけ書き換わってしまう。
    const allowed = await assertCanUpdateAvatarSvc(ctx, employeeId);
    if (!allowed.success) return allowed;

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

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);

    const result = await updateEmployeeAvatarSvc(ctx, employeeId, urlData.publicUrl);
    if (!result.success) return result;

    revalidatePath(`/employees/${employeeId}`);
    return ok({ path: urlData.publicUrl });
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function fetchDepartments(): Promise<DepartmentOption[]> {
  try {
    const ctx = await getAuthContext();
    return await getDepartmentsSvc(ctx);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}

export async function fetchEmployeeSkills(id: string): Promise<EmployeeSkillRow[]> {
  const parsed = employeeId.safeParse(id);
  if (!parsed.success) {
    return [];
  }

  try {
    const ctx = await getAuthContext();
    return await getSkillsSvc(ctx, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}

export async function fetchEmployeeOneOnOnes(id: string): Promise<OneOnOneRow[]> {
  const parsed = employeeId.safeParse(id);
  if (!parsed.success) {
    return [];
  }

  try {
    const ctx = await getAuthContext();
    return await getOneOnOnesSvc(ctx, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}

export async function fetchEmployeeEvaluations(id: string): Promise<EvaluationRow[]> {
  const parsed = employeeId.safeParse(id);
  if (!parsed.success) {
    return [];
  }

  try {
    const ctx = await getAuthContext();
    return await getEvaluationsSvc(ctx, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return [];
    throw e;
  }
}
