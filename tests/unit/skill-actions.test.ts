import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * Server Actions は「UI から届いた未検証の値」を最初に受け取る層であり、
 * 実質的な入力境界。各アクションは以下の分岐を持つ定型構造になっている。
 *
 *   1. Zod バリデーション失敗 → err(最初のメッセージ)
 *   2. 正常系              → Service Layer の結果をそのまま返す
 *   3. 成功時のみ            revalidatePath を呼ぶ（失敗時は呼ばない）
 *   4. AuthorizationError  → err('権限がありません')
 *   5. それ以外の例外        → 握り潰さず再 throw
 *
 * 5 が重要で、ここを握り潰すと DB 障害が「操作は失敗したが理由不明」として
 * ユーザーに見えてしまう。分岐網羅として全経路を通す。
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth', () => ({ getAuthContext }));

vi.mock('@/services/skill', () => ({
  listSkills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  getCategories: vi.fn(),
  getSkillMatrix: vi.fn(),
  assignSkill: vi.fn(),
  removeSkillAssignment: vi.fn(),
}));

async function svc() {
  return vi.mocked(await import('@/services/skill'));
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
});

describe('fetchSkills', () => {
  it('rejects an invalid query without touching the service', async () => {
    const { fetchSkills } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();

    const result = await fetchSkills({ page: 0 } as never);

    expect(result.success).toBe(false);
    expect(s.listSkills).not.toHaveBeenCalled();
  });

  it('returns the service result on success', async () => {
    const { fetchSkills } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.listSkills.mockResolvedValue({ skills: [], total: 0 } as never);

    const result = await fetchSkills({ page: 1, perPage: 20 } as never);

    expect(result).toEqual(ok({ skills: [], total: 0 }));
    expect(s.listSkills).toHaveBeenCalledWith(ctxAdmin, expect.objectContaining({ page: 1 }));
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchSkills } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.listSkills.mockRejectedValue(new AuthorizationError('read', 'skill'));

    const result = await fetchSkills({ page: 1, perPage: 20 } as never);

    expect(result).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    const { fetchSkills } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.listSkills.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchSkills({ page: 1, perPage: 20 } as never)).rejects.toThrow(
      'connection terminated',
    );
  });
});

describe('createSkillAction', () => {
  it('rejects a blank name with the schema message', async () => {
    const { createSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();

    const result = await createSkillAction({ name: '' });

    expect(result).toEqual(err('スキル名を入力してください'));
    expect(s.createSkill).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates the page on success', async () => {
    const { createSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.createSkill.mockResolvedValue(ok({ id: VALID_UUID }) as never);

    const result = await createSkillAction({ name: 'React', category: 'FE' });

    expect(result).toEqual(ok({ id: VALID_UUID }));
    expect(revalidatePath).toHaveBeenCalledWith('/skills');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { createSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.createSkill.mockResolvedValue(err('同名のスキルが既に存在します') as never);

    const result = await createSkillAction({ name: 'React' });

    expect(result.success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { createSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.createSkill.mockRejectedValue(new AuthorizationError('create', 'skill'));

    expect(await createSkillAction({ name: 'React' })).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { createSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.createSkill.mockRejectedValue(new Error('deadlock detected'));

    await expect(createSkillAction({ name: 'React' })).rejects.toThrow('deadlock detected');
  });
});

describe('updateSkillAction', () => {
  it('rejects input missing a valid id', async () => {
    const { updateSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();

    const result = await updateSkillAction({ id: 'not-a-uuid', name: 'React' });

    expect(result.success).toBe(false);
    expect(s.updateSkill).not.toHaveBeenCalled();
  });

  it('revalidates on success only', async () => {
    const { updateSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.updateSkill.mockResolvedValue(ok(undefined) as never);

    await updateSkillAction({ id: VALID_UUID, name: 'React' });

    expect(revalidatePath).toHaveBeenCalledWith('/skills');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { updateSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.updateSkill.mockResolvedValue(err('スキルが見つかりません') as never);

    expect((await updateSkillAction({ id: VALID_UUID, name: 'React' })).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { updateSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.updateSkill.mockRejectedValue(new AuthorizationError('update', 'skill'));

    expect(await updateSkillAction({ id: VALID_UUID, name: 'React' })).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { updateSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.updateSkill.mockRejectedValue(new Error('boom'));

    await expect(updateSkillAction({ id: VALID_UUID, name: 'React' })).rejects.toThrow('boom');
  });
});

describe('deleteSkillAction', () => {
  it('revalidates on success', async () => {
    const { deleteSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.deleteSkill.mockResolvedValue(ok(undefined) as never);

    expect(await deleteSkillAction(VALID_UUID)).toEqual(ok(undefined));
    expect(revalidatePath).toHaveBeenCalledWith('/skills');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { deleteSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.deleteSkill.mockResolvedValue(err('スキルが見つかりません') as never);

    expect((await deleteSkillAction(VALID_UUID)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { deleteSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.deleteSkill.mockRejectedValue(new AuthorizationError('delete', 'skill'));

    expect(await deleteSkillAction(VALID_UUID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { deleteSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.deleteSkill.mockRejectedValue(new Error('boom'));

    await expect(deleteSkillAction(VALID_UUID)).rejects.toThrow('boom');
  });
});

describe('fetchCategories', () => {
  it('returns the categories from the service', async () => {
    const { fetchCategories } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.getCategories.mockResolvedValue(['FE', 'BE'] as never);

    expect(await fetchCategories()).toEqual(['FE', 'BE']);
  });

  it('degrades to an empty list when not permitted', async () => {
    // 一覧の付随情報なので、権限が無い場合はエラーではなく空で返す設計。
    const { fetchCategories } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.getCategories.mockRejectedValue(new AuthorizationError('read', 'skill'));

    expect(await fetchCategories()).toEqual([]);
  });

  it('rethrows unexpected errors', async () => {
    const { fetchCategories } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.getCategories.mockRejectedValue(new Error('boom'));

    await expect(fetchCategories()).rejects.toThrow('boom');
  });
});

describe('fetchSkillMatrix', () => {
  it('rejects an invalid query', async () => {
    const { fetchSkillMatrix } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();

    const result = await fetchSkillMatrix({ departmentId: 'not-a-uuid' } as never);

    expect(result.success).toBe(false);
    expect(s.getSkillMatrix).not.toHaveBeenCalled();
  });

  it('returns the matrix on success', async () => {
    const { fetchSkillMatrix } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.getSkillMatrix.mockResolvedValue({ employees: [], skills: [], levels: {} } as never);

    const result = await fetchSkillMatrix({} as never);

    expect(result.success).toBe(true);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchSkillMatrix } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.getSkillMatrix.mockRejectedValue(new AuthorizationError('read', 'skill'));

    expect(await fetchSkillMatrix({} as never)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { fetchSkillMatrix } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.getSkillMatrix.mockRejectedValue(new Error('boom'));

    await expect(fetchSkillMatrix({} as never)).rejects.toThrow('boom');
  });
});

describe('assignSkillAction', () => {
  it('rejects a level outside the 1-5 range', async () => {
    const { assignSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();

    const result = await assignSkillAction({
      employeeId: VALID_UUID,
      skillId: OTHER_UUID,
      level: 6,
    });

    expect(result.success).toBe(false);
    expect(s.assignSkill).not.toHaveBeenCalled();
  });

  it('revalidates on success', async () => {
    const { assignSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.assignSkill.mockResolvedValue(ok(undefined) as never);

    await assignSkillAction({ employeeId: VALID_UUID, skillId: OTHER_UUID, level: 3 });

    expect(revalidatePath).toHaveBeenCalledWith('/skills');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { assignSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.assignSkill.mockResolvedValue(err('従業員が見つかりません') as never);

    const result = await assignSkillAction({
      employeeId: VALID_UUID,
      skillId: OTHER_UUID,
      level: 3,
    });

    expect(result.success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { assignSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.assignSkill.mockRejectedValue(new AuthorizationError('update', 'employee_skill'));

    expect(
      await assignSkillAction({ employeeId: VALID_UUID, skillId: OTHER_UUID, level: 3 }),
    ).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { assignSkillAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.assignSkill.mockRejectedValue(new Error('boom'));

    await expect(
      assignSkillAction({ employeeId: VALID_UUID, skillId: OTHER_UUID, level: 3 }),
    ).rejects.toThrow('boom');
  });
});

describe('removeSkillAssignmentAction', () => {
  it('revalidates on success', async () => {
    const { removeSkillAssignmentAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.removeSkillAssignment.mockResolvedValue(ok(undefined) as never);

    await removeSkillAssignmentAction(VALID_UUID, OTHER_UUID);

    expect(revalidatePath).toHaveBeenCalledWith('/skills');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { removeSkillAssignmentAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.removeSkillAssignment.mockResolvedValue(err('割当が見つかりません') as never);

    await removeSkillAssignmentAction(VALID_UUID, OTHER_UUID);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { removeSkillAssignmentAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.removeSkillAssignment.mockRejectedValue(new AuthorizationError('delete', 'employee_skill'));

    expect(await removeSkillAssignmentAction(VALID_UUID, OTHER_UUID)).toEqual(
      err('権限がありません'),
    );
  });

  it('rethrows unexpected errors', async () => {
    const { removeSkillAssignmentAction } = await import('@/app/(dashboard)/skills/actions');
    const s = await svc();
    s.removeSkillAssignment.mockRejectedValue(new Error('boom'));

    await expect(removeSkillAssignmentAction(VALID_UUID, OTHER_UUID)).rejects.toThrow('boom');
  });
});
