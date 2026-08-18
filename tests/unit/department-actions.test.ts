import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * 部署 Server Actions のユニットテスト。
 *
 * 各アクションは以下の定型構造を持つ。
 *
 *   1. Zod バリデーション失敗 → err(最初のメッセージ)。Service は呼ばれない
 *   2. 正常系              → Service Layer の結果をそのまま返す
 *   3. 成功時のみ            revalidatePath を呼ぶ（Service が失敗を返したら呼ばない）
 *   4. AuthorizationError  → err('権限がありません')
 *   5. それ以外の例外        → 握り潰さず再 throw
 *
 * 部署は従業員一覧のフィルタ・表示名にも使われるため、更新系は
 * /departments と /employees の両方を revalidate する。片方の抜けは
 * 「部署名を変えたのに従業員一覧に旧名が残る」という形で表面化するので、
 * 呼ばれるパスを全て検証する。
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth', () => ({ getAuthContext }));

vi.mock('@/services/department', () => ({
  getDepartmentTree: vi.fn(),
  listDepartments: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
}));

async function svc() {
  return vi.mocked(await import('@/services/department'));
}

async function actions() {
  return await import('@/app/(dashboard)/departments/actions');
}

const DEPT_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
});

describe('fetchDepartmentTree', () => {
  it('wraps the tree from the service in ok()', async () => {
    const { fetchDepartmentTree } = await actions();
    const s = await svc();
    s.getDepartmentTree.mockResolvedValue([{ id: DEPT_ID, children: [] }] as never);

    expect(await fetchDepartmentTree()).toEqual(ok([{ id: DEPT_ID, children: [] }]));
    expect(s.getDepartmentTree).toHaveBeenCalledWith(ctxAdmin);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchDepartmentTree } = await actions();
    const s = await svc();
    s.getDepartmentTree.mockRejectedValue(new AuthorizationError('read', 'department'));

    expect(await fetchDepartmentTree()).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    // 組織図が空で描画されるのと、DB が落ちているのは別事象。
    // 後者を err/空に潰すと障害に気づけない。
    const { fetchDepartmentTree } = await actions();
    const s = await svc();
    s.getDepartmentTree.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchDepartmentTree()).rejects.toThrow('connection terminated');
  });
});

describe('fetchDepartmentList', () => {
  it('wraps the list from the service in ok()', async () => {
    const { fetchDepartmentList } = await actions();
    const s = await svc();
    s.listDepartments.mockResolvedValue([{ id: DEPT_ID, name: '開発部' }] as never);

    expect(await fetchDepartmentList()).toEqual(ok([{ id: DEPT_ID, name: '開発部' }]));
    expect(s.listDepartments).toHaveBeenCalledWith(ctxAdmin);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchDepartmentList } = await actions();
    const s = await svc();
    s.listDepartments.mockRejectedValue(new AuthorizationError('read', 'department'));

    expect(await fetchDepartmentList()).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { fetchDepartmentList } = await actions();
    const s = await svc();
    s.listDepartments.mockRejectedValue(new Error('boom'));

    await expect(fetchDepartmentList()).rejects.toThrow('boom');
  });
});

describe('createDepartmentAction', () => {
  it('rejects a blank name with the schema message', async () => {
    const { createDepartmentAction } = await actions();
    const s = await svc();

    expect(await createDepartmentAction({ name: '' })).toEqual(err('部署名を入力してください'));
    expect(s.createDepartment).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a parentId that is not a uuid', async () => {
    // 親 ID が不正なまま Service に届くと uuid キャストで 500 になる。
    const { createDepartmentAction } = await actions();
    const s = await svc();

    expect(await createDepartmentAction({ name: '開発部', parentId: 'not-a-uuid' })).toEqual(
      err('無効な親部署IDです'),
    );
    expect(s.createDepartment).not.toHaveBeenCalled();
  });

  it('creates with the parsed data and revalidates both pages', async () => {
    const { createDepartmentAction } = await actions();
    const s = await svc();
    s.createDepartment.mockResolvedValue(ok({ id: DEPT_ID }) as never);

    const result = await createDepartmentAction({ name: '開発部', parentId: PARENT_ID });

    expect(result).toEqual(ok({ id: DEPT_ID }));
    expect(s.createDepartment).toHaveBeenCalledWith(ctxAdmin, {
      name: '開発部',
      parentId: PARENT_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/departments');
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it('does not revalidate when the service reports failure', async () => {
    const { createDepartmentAction } = await actions();
    const s = await svc();
    s.createDepartment.mockResolvedValue(err('同名の部署が既に存在します') as never);

    expect(await createDepartmentAction({ name: '開発部' })).toEqual(
      err('同名の部署が既に存在します'),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { createDepartmentAction } = await actions();
    const s = await svc();
    s.createDepartment.mockRejectedValue(new AuthorizationError('create', 'department'));

    expect(await createDepartmentAction({ name: '開発部' })).toEqual(err('権限がありません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    const { createDepartmentAction } = await actions();
    const s = await svc();
    s.createDepartment.mockRejectedValue(new Error('deadlock detected'));

    await expect(createDepartmentAction({ name: '開発部' })).rejects.toThrow('deadlock detected');
  });
});

describe('updateDepartmentAction', () => {
  it('rejects input whose id is not a uuid', async () => {
    const { updateDepartmentAction } = await actions();
    const s = await svc();

    expect((await updateDepartmentAction({ id: 'not-a-uuid', name: '開発部' })).success).toBe(
      false,
    );
    expect(s.updateDepartment).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('separates the id from the update fields', async () => {
    // id が fields に混入すると主キーを更新しかねない。
    const { updateDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockResolvedValue(ok(undefined) as never);

    await updateDepartmentAction({ id: DEPT_ID, name: '第一開発部' });

    expect(s.updateDepartment).toHaveBeenCalledWith(ctxAdmin, DEPT_ID, { name: '第一開発部' });
    expect(s.updateDepartment.mock.calls[0][2]).not.toHaveProperty('id');
  });

  it('revalidates both the department and employee pages on success', async () => {
    // 部署名は従業員一覧にも出るため、両方のキャッシュを飛ばす必要がある。
    const { updateDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockResolvedValue(ok(undefined) as never);

    await updateDepartmentAction({ id: DEPT_ID, name: '第一開発部' });

    expect(revalidatePath).toHaveBeenCalledWith('/departments');
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it('does not revalidate when the service reports failure', async () => {
    // 循環参照など、Service 側で弾かれるケース。
    const { updateDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockResolvedValue(err('循環参照になるため移動できません') as never);

    expect(await updateDepartmentAction({ id: DEPT_ID, name: '第一開発部' })).toEqual(
      err('循環参照になるため移動できません'),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { updateDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockRejectedValue(new AuthorizationError('update', 'department'));

    expect(await updateDepartmentAction({ id: DEPT_ID, name: '第一開発部' })).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { updateDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockRejectedValue(new Error('boom'));

    await expect(updateDepartmentAction({ id: DEPT_ID, name: '第一開発部' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('moveDepartmentAction', () => {
  it('rejects a non-uuid id', async () => {
    // D&D の実装ミスで DOM の id 文字列がそのまま渡るような事故を境界で止める。
    const { moveDepartmentAction } = await actions();
    const s = await svc();

    expect((await moveDepartmentAction('node-3', PARENT_ID)).success).toBe(false);
    expect(s.updateDepartment).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid parent id', async () => {
    const { moveDepartmentAction } = await actions();
    const s = await svc();

    expect((await moveDepartmentAction(DEPT_ID, 'root')).success).toBe(false);
    expect(s.updateDepartment).not.toHaveBeenCalled();
  });

  it('moves the department under the given parent', async () => {
    const { moveDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockResolvedValue(ok(undefined) as never);

    const result = await moveDepartmentAction(DEPT_ID, PARENT_ID);

    expect(result).toEqual(ok(undefined));
    expect(s.updateDepartment).toHaveBeenCalledWith(ctxAdmin, DEPT_ID, { parentId: PARENT_ID });
    expect(revalidatePath).toHaveBeenCalledWith('/departments');
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('translates a null parent into an empty string (move to root)', async () => {
    // ルートへ移動する D&D 操作は newParentId=null で届く。
    // アクションはこれを '' に変換して Service に渡す契約になっており、
    // null のまま渡すと「変更なし」と誤解釈されうる。
    const { moveDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockResolvedValue(ok(undefined) as never);

    await moveDepartmentAction(DEPT_ID, null);

    expect(s.updateDepartment).toHaveBeenCalledWith(ctxAdmin, DEPT_ID, { parentId: '' });
  });

  it('does not revalidate when the service reports failure', async () => {
    const { moveDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockResolvedValue(err('循環参照になるため移動できません') as never);

    expect(await moveDepartmentAction(DEPT_ID, PARENT_ID)).toEqual(
      err('循環参照になるため移動できません'),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { moveDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockRejectedValue(new AuthorizationError('update', 'department'));

    expect(await moveDepartmentAction(DEPT_ID, PARENT_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { moveDepartmentAction } = await actions();
    const s = await svc();
    s.updateDepartment.mockRejectedValue(new Error('boom'));

    await expect(moveDepartmentAction(DEPT_ID, PARENT_ID)).rejects.toThrow('boom');
  });
});

describe('deleteDepartmentAction', () => {
  it('deletes and revalidates both pages on success', async () => {
    // 部署削除は従業員の所属表示にも影響するため /employees も飛ばす。
    const { deleteDepartmentAction } = await actions();
    const s = await svc();
    s.deleteDepartment.mockResolvedValue(ok(undefined) as never);

    expect(await deleteDepartmentAction(DEPT_ID)).toEqual(ok(undefined));
    expect(s.deleteDepartment).toHaveBeenCalledWith(ctxAdmin, DEPT_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/departments');
    expect(revalidatePath).toHaveBeenCalledWith('/employees');
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it('does not revalidate when the service reports failure', async () => {
    // 子部署や所属従業員が残っている場合は Service が失敗を返す。
    const { deleteDepartmentAction } = await actions();
    const s = await svc();
    s.deleteDepartment.mockResolvedValue(err('子部署が存在するため削除できません') as never);

    expect(await deleteDepartmentAction(DEPT_ID)).toEqual(
      err('子部署が存在するため削除できません'),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { deleteDepartmentAction } = await actions();
    const s = await svc();
    s.deleteDepartment.mockRejectedValue(new AuthorizationError('delete', 'department'));

    expect(await deleteDepartmentAction(DEPT_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { deleteDepartmentAction } = await actions();
    const s = await svc();
    s.deleteDepartment.mockRejectedValue(new Error('boom'));

    await expect(deleteDepartmentAction(DEPT_ID)).rejects.toThrow('boom');
  });
});
