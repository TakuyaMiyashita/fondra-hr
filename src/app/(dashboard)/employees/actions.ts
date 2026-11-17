'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { uuidField } from '@/lib/validations/common';
import { createClient } from '@/lib/supabase/server';
import {
  avatarExtension,
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
  uploadAvatarSchema,
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
 * 従業員フォルダのアバターファイル名を返す。
 *
 * **確かめられなかったときは成功にしない。** 一覧が取れないということは
 * 写真の有無が分からないということで、そのまま匿名化に進むと
 * 「消したつもりで残っている」になる。削除請求の文脈では最悪の結果。
 */
async function listAvatarFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  folder: string,
): Promise<Result<string[]>> {
  const { data, error } = await supabase.storage.from('avatars').list(folder);

  if (error) {
    // Storage の生エラーは画面に出さない。詳細はサーバーログへ。
    console.error('[listAvatarFiles] storage list failed', error);
    return err('アバターの確認に失敗しました');
  }
  if (!data) {
    return err('アバターの確認に失敗しました');
  }

  // ダッシュボードから作られたフォルダには空フォルダ用の
  // プレースホルダが入ることがある。ファイルとして数えない。
  return ok(data.map((f) => f.name).filter((name) => name !== '.emptyFolderPlaceholder'));
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

    const listed = await listAvatarFiles(supabase, folder);
    if (!listed.success) return listed;

    if (listed.data.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('avatars')
        .remove(listed.data.map((name) => `${folder}/${name}`));
      if (removeError) {
        console.error('[anonymizeEmployeeAction] storage remove failed', removeError);
        return err('アバターの削除に失敗しました');
      }

      // **remove() はポリシーで拒否されても error を返さない。** 消せなかった
      // オブジェクトを黙って結果から外すだけなので、戻り値を見ても気づけない
      // （tests/rls/storage-avatars.test.ts がこの挙動を直接確かめている）。
      // 消えたことを list で確かめないと、DB だけ匿名化されて顔写真は
      // Storage に残る。個人情報を消す操作で一番機微なものだけが残ることになる。
      const after = await listAvatarFiles(supabase, folder);
      if (!after.success) return after;
      if (after.data.length > 0) {
        return err('アバターを削除できませんでした。権限を確認してください');
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

export async function uploadAvatarAction(
  rawEmployeeId: string,
  formData: FormData,
): Promise<Result<{ path: string }>> {
  // employeeId もファイルも未検証の入力。UUID でない ID は後段の DB クエリを
  // 例外で落とし、文字列の file は file.name で落ちる。どちらも Result で返す。
  const parsed = uploadAvatarSchema.safeParse({
    employeeId: rawEmployeeId,
    file: formData.get('file'),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }
  const { employeeId, file } = parsed.data;

  try {
    const ctx = await getAuthContext();

    // Storage への書き込みは Service Layer の外で起きるため、
    // 先に権限を確かめる。updateEmployeeAvatarSvc は後段にあり、
    // そこまで待つとファイルだけ書き換わってしまう。
    const allowed = await assertCanUpdateAvatarSvc(ctx, employeeId);
    if (!allowed.success) return allowed;

    // 拡張子はスキーマでホワイトリスト済み。
    const ext = avatarExtension(file);
    const storagePath = `${ctx.orgId}/${employeeId}/avatar.${ext}`;

    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      // Storage の生エラーは画面に出さない（内部の制約やバケット名が漏れる）。
      console.error('[uploadAvatarAction] storage upload failed', uploadError);
      return err('アップロードに失敗しました');
    }

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
