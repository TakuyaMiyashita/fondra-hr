import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * 従業員 Server Actions のユニットテスト。
 *
 * Server Actions は「UI から届いた未検証の値」を最初に受け取る層であり、
 * 実質的な入力境界。各アクションは以下の定型構造を持つ。
 *
 *   1. Zod バリデーション失敗 → err(最初のメッセージ)。Service は呼ばれない
 *   2. 正常系              → Service Layer の結果をそのまま返す
 *   3. 成功時のみ            revalidatePath を呼ぶ（Service が失敗を返したら呼ばない）
 *   4. AuthorizationError  → err('権限がありません') / 一覧系は空配列に降格
 *   5. それ以外の例外        → 握り潰さず再 throw
 *
 * 特に 5 が重要で、ここを握り潰すと DB 障害が「操作は失敗したが理由不明」として
 * ユーザーに見えてしまう。分岐網羅として全経路を通す。
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth', () => ({ getAuthContext }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));

vi.mock('@/services/employee', () => ({
  listEmployees: vi.fn(),
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  anonymizeEmployee: vi.fn(),
  assertCanUpdateAvatar: vi.fn(),
  updateEmployeeAvatar: vi.fn(),
  getDepartmentsForOrg: vi.fn(),
  getEmployeeSkills: vi.fn(),
  getEmployeeOneOnOnes: vi.fn(),
  getEmployeeEvaluations: vi.fn(),
}));

async function svc() {
  return vi.mocked(await import('@/services/employee'));
}

async function actions() {
  return await import('@/app/(dashboard)/employees/actions');
}

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const DEPARTMENT_ID = '22222222-2222-4222-8222-222222222222';

/** create の最小有効入力。status はスキーマ側の default('active') が入る。 */
const validCreateInput = { employeeCode: 'E001', fullName: '山田太郎' };

/** Storage のモック。upload / getPublicUrl の戻りをテストごとに差し替える。 */
const storageUpload = vi.fn();
const storageGetPublicUrl = vi.fn();
const storageList = vi.fn();
const storageRemove = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
  (await svc()).assertCanUpdateAvatar.mockResolvedValue(ok(undefined));
  storageUpload.mockResolvedValue({ error: null });
  storageGetPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://cdn.example.com/avatars/avatar.png' },
  });
  storageList.mockResolvedValue({ data: [{ name: 'avatar.png' }], error: null });
  storageRemove.mockResolvedValue({ error: null });
  createClient.mockResolvedValue({
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        getPublicUrl: storageGetPublicUrl,
        list: storageList,
        remove: storageRemove,
      })),
    },
  });
});

describe('fetchEmployees', () => {
  it('rejects an invalid query without touching the service', async () => {
    // 不正なページ番号がそのまま Service（＝SQL の OFFSET）に流れると
    // 例外や意図しない全件取得になりうるため、境界で止める。
    const { fetchEmployees } = await actions();
    const s = await svc();

    const result = await fetchEmployees({ page: 0 } as never);

    expect(result).toEqual(err(expect.any(String)));
    expect(s.listEmployees).not.toHaveBeenCalled();
  });

  it('passes the AuthContext and the parsed query to the service', async () => {
    // Service に渡るのは「生の query」ではなく「Zod が default を埋めた parsed」であること。
    // ここがズレると perPage 未指定時に undefined が LIMIT に渡る。
    const { fetchEmployees } = await actions();
    const s = await svc();
    s.listEmployees.mockResolvedValue({ employees: [], total: 0 } as never);

    const result = await fetchEmployees({ page: 2, search: '山田' } as never);

    expect(result).toEqual(ok({ employees: [], total: 0 }));
    expect(s.listEmployees).toHaveBeenCalledWith(ctxAdmin, {
      page: 2,
      perPage: 20,
      sort: 'createdAt',
      order: 'desc',
      search: '山田',
    });
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchEmployees } = await actions();
    const s = await svc();
    s.listEmployees.mockRejectedValue(new AuthorizationError('read', 'employee'));

    expect(await fetchEmployees({} as never)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    // DB 障害が err() に化けると、運用時に「なぜ失敗したか」が追えなくなる。
    const { fetchEmployees } = await actions();
    const s = await svc();
    s.listEmployees.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchEmployees({} as never)).rejects.toThrow('connection terminated');
  });
});

describe('fetchEmployee', () => {
  it('returns the service Result as-is (no rewrapping)', async () => {
    // このアクションは Service の Result をそのまま返す設計。
    // ok() で包み直すと Result が二重になり UI 側が壊れる。
    const { fetchEmployee } = await actions();
    const s = await svc();
    s.getEmployee.mockResolvedValue(ok({ id: EMPLOYEE_ID }) as never);

    expect(await fetchEmployee(EMPLOYEE_ID)).toEqual(ok({ id: EMPLOYEE_ID }));
    expect(s.getEmployee).toHaveBeenCalledWith(ctxAdmin, EMPLOYEE_ID);
  });

  it('propagates a not-found failure from the service', async () => {
    const { fetchEmployee } = await actions();
    const s = await svc();
    s.getEmployee.mockResolvedValue(err('従業員が見つかりません') as never);

    expect(await fetchEmployee(EMPLOYEE_ID)).toEqual(err('従業員が見つかりません'));
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchEmployee } = await actions();
    const s = await svc();
    s.getEmployee.mockRejectedValue(new AuthorizationError('read', 'employee'));

    expect(await fetchEmployee(EMPLOYEE_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { fetchEmployee } = await actions();
    const s = await svc();
    s.getEmployee.mockRejectedValue(new Error('boom'));

    await expect(fetchEmployee(EMPLOYEE_ID)).rejects.toThrow('boom');
  });
});

describe('createEmployeeAction', () => {
  it('rejects a blank employee code with the schema message', async () => {
    const { createEmployeeAction } = await actions();
    const s = await svc();

    const result = await createEmployeeAction({ employeeCode: '', fullName: '山田太郎' });

    expect(result).toEqual(err('社員番号を入力してください'));
    expect(s.createEmployee).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before it reaches the database', async () => {
    // メールは一意制約の対象になりうるので、不正値が DB まで届くと
    // 制約違反という分かりにくいエラーになる。境界で弾く。
    const { createEmployeeAction } = await actions();
    const s = await svc();

    const result = await createEmployeeAction({ ...validCreateInput, email: 'not-an-email' });

    expect(result).toEqual(err('有効なメールアドレスを入力してください'));
    expect(s.createEmployee).not.toHaveBeenCalled();
  });

  it('creates with the parsed data and revalidates the list', async () => {
    const { createEmployeeAction } = await actions();
    const s = await svc();
    s.createEmployee.mockResolvedValue(ok({ id: EMPLOYEE_ID }) as never);

    const result = await createEmployeeAction({ ...validCreateInput, departmentId: DEPARTMENT_ID });

    expect(result).toEqual(ok({ id: EMPLOYEE_ID }));
    expect(s.createEmployee).toHaveBeenCalledWith(ctxAdmin, {
      employeeCode: 'E001',
      fullName: '山田太郎',
      departmentId: DEPARTMENT_ID,
      status: 'active',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
  });

  it('does not revalidate when the service reports failure', async () => {
    // 失敗したのにキャッシュを飛ばすと、無駄な再取得が発生するうえ
    // 「成功したように見える」挙動につながる。
    const { createEmployeeAction } = await actions();
    const s = await svc();
    s.createEmployee.mockResolvedValue(err('社員番号が重複しています') as never);

    expect(await createEmployeeAction(validCreateInput)).toEqual(err('社員番号が重複しています'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { createEmployeeAction } = await actions();
    const s = await svc();
    s.createEmployee.mockRejectedValue(new AuthorizationError('create', 'employee'));

    expect(await createEmployeeAction(validCreateInput)).toEqual(err('権限がありません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    const { createEmployeeAction } = await actions();
    const s = await svc();
    s.createEmployee.mockRejectedValue(new Error('deadlock detected'));

    await expect(createEmployeeAction(validCreateInput)).rejects.toThrow('deadlock detected');
  });
});

describe('updateEmployeeAction', () => {
  it('rejects input whose id is not a uuid', async () => {
    // id が UUID でないまま Service に届くと、Postgres の uuid キャストで
    // 型エラー（500）になる。ここで弾いてユーザーに読めるエラーを返す。
    const { updateEmployeeAction } = await actions();
    const s = await svc();

    const result = await updateEmployeeAction({ id: 'not-a-uuid', fullName: '山田太郎' });

    expect(result.success).toBe(false);
    expect(s.updateEmployee).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('separates the id from the update fields', async () => {
    // id が fields 側に混入すると主キーを更新しかねないため、
    // 「id は第2引数、それ以外だけが fields」であることを固定する。
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockResolvedValue(ok(undefined) as never);

    await updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子', position: '課長' });

    const [passedCtx, passedId, fields] = s.updateEmployee.mock.calls[0];
    expect(passedCtx).toBe(ctxAdmin);
    expect(passedId).toBe(EMPLOYEE_ID);
    expect(fields).not.toHaveProperty('id');
    expect(fields).toMatchObject({ fullName: '山田花子', position: '課長' });
  });

  it('does not send status when the caller omits it', async () => {
    // 回帰防止。以前は updateEmployeeSchema が status を
    // .default('active').optional() で組み立てており、Zod では default が
    // 優先されるため status を送らない部分更新でも 'active' が埋まっていた。
    // Service は undefined のみスキップするので、retired / inactive の従業員を
    // 氏名だけ編集すると在籍に戻り、監査ログにも身に覚えのない変更が残った。
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockResolvedValue(ok(undefined) as never);

    await updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子' });

    expect(s.updateEmployee.mock.calls[0][2]).toEqual({ fullName: '山田花子' });
  });

  it('still forwards status when the caller sends it explicitly', async () => {
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockResolvedValue(ok(undefined) as never);

    await updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子', status: 'retired' });

    expect(s.updateEmployee.mock.calls[0][2]).toMatchObject({ status: 'retired' });
  });

  it('revalidates both the list and the detail page on success', async () => {
    // 詳細ページのキャッシュを飛ばし忘れると、更新後も旧データが表示される。
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockResolvedValue(ok(undefined) as never);

    await updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子' });

    expect(revalidatePath).toHaveBeenCalledWith('/employees');
    expect(revalidatePath).toHaveBeenCalledWith(`/employees/${EMPLOYEE_ID}`);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it('does not revalidate when the service reports failure', async () => {
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockResolvedValue(err('従業員が見つかりません') as never);

    expect(await updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子' })).toEqual(
      err('従業員が見つかりません'),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockRejectedValue(new AuthorizationError('update', 'employee'));

    expect(await updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子' })).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { updateEmployeeAction } = await actions();
    const s = await svc();
    s.updateEmployee.mockRejectedValue(new Error('boom'));

    await expect(updateEmployeeAction({ id: EMPLOYEE_ID, fullName: '山田花子' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('deleteEmployeeAction', () => {
  it('deletes and revalidates the list on success', async () => {
    const { deleteEmployeeAction } = await actions();
    const s = await svc();
    s.deleteEmployee.mockResolvedValue(ok(undefined) as never);

    expect(await deleteEmployeeAction(EMPLOYEE_ID)).toEqual(ok(undefined));
    expect(s.deleteEmployee).toHaveBeenCalledWith(ctxAdmin, EMPLOYEE_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { deleteEmployeeAction } = await actions();
    const s = await svc();
    s.deleteEmployee.mockResolvedValue(err('従業員が見つかりません') as never);

    expect((await deleteEmployeeAction(EMPLOYEE_ID)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { deleteEmployeeAction } = await actions();
    const s = await svc();
    s.deleteEmployee.mockRejectedValue(new AuthorizationError('delete', 'employee'));

    expect(await deleteEmployeeAction(EMPLOYEE_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { deleteEmployeeAction } = await actions();
    const s = await svc();
    s.deleteEmployee.mockRejectedValue(new Error('boom'));

    await expect(deleteEmployeeAction(EMPLOYEE_ID)).rejects.toThrow('boom');
  });
});

describe('anonymizeEmployeeAction', () => {
  it('rejects an invalid id without touching the service', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();

    expect((await anonymizeEmployeeAction('not-a-uuid')).success).toBe(false);
    expect(s.anonymizeEmployee).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('権限が無ければ Storage に触れる前に落とす', async () => {
    // 顔写真の削除は Service Layer の外で起きる。判定が後段だと、
    // 権限の無いユーザーでもファイルだけ消せてしまう。
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    s.assertCanUpdateAvatar.mockResolvedValue(err('権限がありません'));

    expect(await anonymizeEmployeeAction(EMPLOYEE_ID)).toEqual(err('権限がありません'));

    expect(createClient).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
    expect(s.anonymizeEmployee).not.toHaveBeenCalled();
  });

  it('removes every file under the employee folder before updating the record', async () => {
    // 拡張子は登録時のファイル名で決まる。パスを組み立てると差し替えの
    // 残骸が消えず、顔写真だけ Storage に残る。
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    storageList.mockResolvedValue({
      data: [{ name: 'avatar.png' }, { name: 'avatar.jpg' }],
      error: null,
    });
    s.anonymizeEmployee.mockResolvedValue(ok(undefined));

    expect(await anonymizeEmployeeAction(EMPLOYEE_ID)).toEqual(ok(undefined));

    expect(storageRemove).toHaveBeenCalledWith([
      `${ctxAdmin.orgId}/${EMPLOYEE_ID}/avatar.png`,
      `${ctxAdmin.orgId}/${EMPLOYEE_ID}/avatar.jpg`,
    ]);
    expect(s.anonymizeEmployee).toHaveBeenCalledWith(ctxAdmin, EMPLOYEE_ID);
  });

  it('skips the remove call when the folder is empty', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    storageList.mockResolvedValue({ data: [], error: null });
    s.anonymizeEmployee.mockResolvedValue(ok(undefined));

    expect(await anonymizeEmployeeAction(EMPLOYEE_ID)).toEqual(ok(undefined));
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('tolerates a null listing', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    storageList.mockResolvedValue({ data: null, error: null });
    s.anonymizeEmployee.mockResolvedValue(ok(undefined));

    expect(await anonymizeEmployeeAction(EMPLOYEE_ID)).toEqual(ok(undefined));
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('stops before anonymizing when the avatar cannot be removed', async () => {
    // ここで先に進むと「匿名化済みなのに顔写真は残っている」状態になる。
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    storageRemove.mockResolvedValue({ error: { message: 'network' } });

    expect(await anonymizeEmployeeAction(EMPLOYEE_ID)).toEqual(
      err('アバターの削除に失敗しました: network'),
    );
    expect(s.anonymizeEmployee).not.toHaveBeenCalled();
  });

  it('does not revalidate when the service fails', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    s.anonymizeEmployee.mockResolvedValue(err('この従業員は既に匿名化されています'));

    expect((await anonymizeEmployeeAction(EMPLOYEE_ID)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates the list and the detail on success', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    s.anonymizeEmployee.mockResolvedValue(ok(undefined));

    await anonymizeEmployeeAction(EMPLOYEE_ID);

    expect(revalidatePath).toHaveBeenCalledWith('/employees');
    expect(revalidatePath).toHaveBeenCalledWith(`/employees/${EMPLOYEE_ID}`);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    s.assertCanUpdateAvatar.mockRejectedValue(new AuthorizationError('update', 'employee'));

    expect(await anonymizeEmployeeAction(EMPLOYEE_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows anything else', async () => {
    const { anonymizeEmployeeAction } = await actions();
    const s = await svc();
    s.assertCanUpdateAvatar.mockRejectedValue(new Error('boom'));

    await expect(anonymizeEmployeeAction(EMPLOYEE_ID)).rejects.toThrow('boom');
  });
});

describe('uploadAvatarAction', () => {
  /** サイズを任意に偽装した File を作る（5MB の実データを確保しないため）。 */
  function fileOf(name: string, size = 1024): File {
    const file = new File(['x'], name, { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  }

  function formOf(file: File | null): FormData {
    const fd = new FormData();
    if (file) fd.append('file', file);
    return fd;
  }

  it('権限が無ければ Storage に触れる前に落とす', async () => {
    // Storage への書き込みは Service Layer の外で起きる。判定が後段だと、
    // 権限の無いユーザーでもファイルだけ書き換わってしまう。
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.assertCanUpdateAvatar.mockResolvedValue(err('権限がありません'));

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('avatar.png')))).toEqual(
      err('権限がありません'),
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
    expect(s.updateEmployeeAvatar).not.toHaveBeenCalled();
  });

  it('存在しない従業員でも Storage に触れる前に落とす', async () => {
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.assertCanUpdateAvatar.mockResolvedValue(err('従業員が見つかりません'));

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('avatar.png')))).toEqual(
      err('従業員が見つかりません'),
    );

    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects a request with no file attached', async () => {
    const { uploadAvatarAction } = await actions();
    const s = await svc();

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(null))).toEqual(
      err('ファイルが選択されていません'),
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(s.updateEmployeeAvatar).not.toHaveBeenCalled();
  });

  it('rejects a disallowed extension before any upload happens', async () => {
    // 拡張子ホワイトリストは Storage に実行可能ファイルを置かせないための防御。
    // 判定より先にアップロードが走っていないことまで確認する。
    const { uploadAvatarAction } = await actions();

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('payload.svg')))).toEqual(
      err('許可されていないファイル形式です（jpg, png, webp のみ）'),
    );
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('normalizes the extension case (PNG is accepted)', async () => {
    // 大文字拡張子でホワイトリストを弾いてしまうと、正当な画像が上げられなくなる。
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.updateEmployeeAvatar.mockResolvedValue(ok(undefined) as never);

    const result = await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('photo.PNG')));

    expect(result.success).toBe(true);
    expect(storageUpload).toHaveBeenCalledWith(
      `${ctxAdmin.orgId}/${EMPLOYEE_ID}/avatar.png`,
      expect.anything(),
      { upsert: true },
    );
  });

  it('rejects a file with no extension at all', async () => {
    const { uploadAvatarAction } = await actions();

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('avatar')))).toEqual(
      err('許可されていないファイル形式です（jpg, png, webp のみ）'),
    );
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects a file larger than 5MB', async () => {
    // Storage の課金と帯域を守る上限。境界のすぐ上を通す。
    const { uploadAvatarAction } = await actions();

    expect(
      await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('big.jpg', 5 * 1024 * 1024 + 1))),
    ).toEqual(err('ファイルサイズが大きすぎます（最大5MB）'));
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the 5MB limit', async () => {
    // 上限は「超えたら NG」であり「ちょうどは OK」。off-by-one を固定する。
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.updateEmployeeAvatar.mockResolvedValue(ok(undefined) as never);

    const result = await uploadAvatarAction(
      EMPLOYEE_ID,
      formOf(fileOf('exact.jpeg', 5 * 1024 * 1024)),
    );

    expect(result.success).toBe(true);
  });

  it('scopes the storage path by org and employee', async () => {
    // Storage は RLS の外側なので、パスに orgId が入っていることが
    // 実質的なテナント分離になる。ここが崩れると他社の画像を上書きできる。
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.updateEmployeeAvatar.mockResolvedValue(ok(undefined) as never);

    const result = await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('me.webp')));

    expect(storageUpload).toHaveBeenCalledWith(
      `${ctxAdmin.orgId}/${EMPLOYEE_ID}/avatar.webp`,
      expect.anything(),
      { upsert: true },
    );
    expect(s.updateEmployeeAvatar).toHaveBeenCalledWith(
      ctxAdmin,
      EMPLOYEE_ID,
      'https://cdn.example.com/avatars/avatar.png',
    );
    expect(result).toEqual(ok({ path: 'https://cdn.example.com/avatars/avatar.png' }));
    expect(revalidatePath).toHaveBeenCalledWith(`/employees/${EMPLOYEE_ID}`);
  });

  it('surfaces the storage error message and skips the DB update', async () => {
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    storageUpload.mockResolvedValue({ error: { message: 'bucket not found' } });

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('me.jpg')))).toEqual(
      err('アップロードに失敗しました: bucket not found'),
    );
    expect(s.updateEmployeeAvatar).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns the service failure and does not revalidate', async () => {
    // ファイルは上がったが DB 更新に失敗したケース。
    // キャッシュを飛ばすと「反映されたはず」の誤認を招く。
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.updateEmployeeAvatar.mockResolvedValue(err('従業員が見つかりません') as never);

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('me.jpg')))).toEqual(
      err('従業員が見つかりません'),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.updateEmployeeAvatar.mockRejectedValue(new AuthorizationError('update', 'employee'));

    expect(await uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('me.jpg')))).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { uploadAvatarAction } = await actions();
    const s = await svc();
    s.updateEmployeeAvatar.mockRejectedValue(new Error('boom'));

    await expect(uploadAvatarAction(EMPLOYEE_ID, formOf(fileOf('me.jpg')))).rejects.toThrow('boom');
  });
});

/**
 * 以下 4 つは「画面の付随情報」を返す取得系。
 * 権限が無い場合は Result ではなく空配列に降格する設計になっている
 * （タブやセレクトが 1 つ描画できないだけで画面全体を落とさないため）。
 * ただし予期しない例外は降格させず再 throw する。
 */
describe.each([
  ['fetchDepartments', 'getDepartmentsForOrg', false],
  ['fetchEmployeeSkills', 'getEmployeeSkills', true],
  ['fetchEmployeeOneOnOnes', 'getEmployeeOneOnOnes', true],
  ['fetchEmployeeEvaluations', 'getEmployeeEvaluations', true],
] as const)('%s', (actionName, serviceName, takesEmployeeId) => {
  type AnyMock = ReturnType<typeof vi.fn>;

  /** 対象アクションを、引数の有無に応じて呼び分ける。 */
  async function call(): Promise<unknown> {
    const mod = (await actions()) as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    return takesEmployeeId ? mod[actionName](EMPLOYEE_ID) : mod[actionName]();
  }

  /** 対象の Service モックを取り出す。 */
  async function serviceMock(): Promise<AnyMock> {
    return (await svc())[serviceName] as unknown as AnyMock;
  }

  it('returns the rows from the service', async () => {
    const mock = await serviceMock();
    mock.mockResolvedValue([{ id: 'row-1' }]);

    expect(await call()).toEqual([{ id: 'row-1' }]);
    expect(mock).toHaveBeenCalledWith(...(takesEmployeeId ? [ctxAdmin, EMPLOYEE_ID] : [ctxAdmin]));
  });

  it('degrades to an empty list when not permitted', async () => {
    const mock = await serviceMock();
    mock.mockRejectedValue(new AuthorizationError('read', 'employee'));

    expect(await call()).toEqual([]);
  });

  it('rethrows unexpected errors', async () => {
    const mock = await serviceMock();
    mock.mockRejectedValue(new Error('boom'));

    await expect(call()).rejects.toThrow('boom');
  });

  if (takesEmployeeId) {
    it('degrades to an empty list when the id is not a UUID', async () => {
      // 非 UUID は Postgres の uuid 比較で型エラー（500）になる。
      // この系統は Result を返さないので、権限不足と同じく空配列に降格する。
      const mod = (await actions()) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const mock = await serviceMock();

      expect(await mod[actionName]('not-a-uuid')).toEqual([]);
      expect(mock).not.toHaveBeenCalled();
    });
  }
});

/**
 * id を単体で受け取るアクションの入力検証。
 *
 * これらは Zod スキーマを持つオブジェクト入力と違い、素の string を受け取る。
 * org_id スコープがあるので他テナントのデータは読めないが、非 UUID が
 * Postgres の uuid 比較に届くと型エラーになり 500 で落ちる。
 * DB に触る前に日本語のエラーで弾く。
 */
describe('id を単体で受け取るアクションの UUID 検証', () => {
  it('fetchEmployee rejects a non-UUID id', async () => {
    const { fetchEmployee } = await actions();
    const s = await svc();

    expect(await fetchEmployee('not-a-uuid')).toEqual(err('無効な従業員IDです'));
    expect(s.getEmployee).not.toHaveBeenCalled();
  });

  it('deleteEmployeeAction rejects a non-UUID id', async () => {
    const { deleteEmployeeAction } = await actions();
    const s = await svc();

    expect(await deleteEmployeeAction('not-a-uuid')).toEqual(err('無効な従業員IDです'));
    expect(s.deleteEmployee).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('空文字も UUID として弾く', async () => {
    // 未選択のセレクトから '' が飛んでくる経路が実在する。
    const { fetchEmployee } = await actions();
    const s = await svc();

    expect(await fetchEmployee('')).toEqual(err('無効な従業員IDです'));
    expect(s.getEmployee).not.toHaveBeenCalled();
  });
});
