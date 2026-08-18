import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * 1on1 ドメインの Server Actions。
 *
 * 各アクションは以下の定型構造を持つ。
 *
 *   1. Zod バリデーション失敗 → err(最初のメッセージ)。Service は呼ばれない
 *   2. 正常系              → Service Layer の結果をそのまま返す
 *   3. 成功時のみ            revalidatePath('/one-on-ones') を呼ぶ
 *   4. AuthorizationError  → err('権限がありません')
 *   5. それ以外の例外        → 握り潰さず再 throw
 *
 * このドメイン固有の要注意点は moodScore。
 *   - create 用スキーマ … min(0) max(5)。0 はそのまま通る
 *   - update 用スキーマ … coerce + min(1) max(5)、0 のみ undefined に変換
 * 「未入力」と「0」の区別が create / update で非対称なので、境界を明示的に固定する。
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth', () => ({ getAuthContext }));

vi.mock('@/services/one-on-one', () => ({
  listOneOnOnes: vi.fn(),
  createOneOnOne: vi.fn(),
  updateOneOnOne: vi.fn(),
  deleteOneOnOne: vi.fn(),
  getEmployeesForOrg: vi.fn(),
}));

const ACTIONS = '@/app/(dashboard)/one-on-ones/actions';

async function svc() {
  return vi.mocked(await import('@/services/one-on-one'));
}

const EMP_ID = '11111111-1111-4111-8111-111111111111';
const INTERVIEWER_ID = '22222222-2222-4222-8222-222222222222';
const RECORD_ID = '33333333-3333-4333-8333-333333333333';

const defaultQuery = { page: 1, perPage: 20, sort: 'heldOn', order: 'desc' } as const;

const validCreate = {
  employeeId: EMP_ID,
  interviewerId: INTERVIEWER_ID,
  heldOn: '2026-08-01',
};

const validUpdate = { id: RECORD_ID, ...validCreate };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
});

describe('fetchOneOnOnes', () => {
  it('applies schema defaults for an empty query', async () => {
    // 一覧はページャ・ソートの既定値をスキーマ側で埋める設計。
    // ここが欠けると Service が undefined の page で LIMIT/OFFSET を組み立てる。
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();
    s.listOneOnOnes.mockResolvedValue({ items: [], total: 0 } as never);

    const result = await fetchOneOnOnes({} as never);

    expect(result).toEqual(ok({ items: [], total: 0 }));
    expect(s.listOneOnOnes).toHaveBeenCalledWith(ctxAdmin, defaultQuery);
  });

  it('coerces numeric strings coming from URL query state', async () => {
    // nuqs 経由の URL 状態は文字列で届くため coerce が必須。
    // 数値化されないと Drizzle の limit() が文字列を受け取り壊れる。
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();
    s.listOneOnOnes.mockResolvedValue({ items: [], total: 0 } as never);

    await fetchOneOnOnes({ page: '3', perPage: '50' } as never);

    expect(s.listOneOnOnes).toHaveBeenCalledWith(
      ctxAdmin,
      expect.objectContaining({ page: 3, perPage: 50 }),
    );
  });

  it.each([
    ['page below 1', { page: 0 }],
    ['perPage below 1', { perPage: 0 }],
    ['perPage above the 100 cap', { perPage: 101 }],
    ['an unknown sort column', { sort: 'moodScore' }],
    ['an unknown order direction', { order: 'sideways' }],
    ['a non-UUID employeeId filter', { employeeId: 'not-a-uuid' }],
    ['a non-UUID interviewerId filter', { interviewerId: 'not-a-uuid' }],
  ])('rejects %s without touching the service', async (_label, patch) => {
    // perPage の上限は DoS 防止。sort/order の enum は SQL 組み立てに
    // 直接使われるため、未知の値を通すと壊れた ORDER BY になる。
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();

    const result = await fetchOneOnOnes(patch as never);

    expect(result.success).toBe(false);
    expect(s.listOneOnOnes).not.toHaveBeenCalled();
  });

  it('passes optional filters through when they are valid', async () => {
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();
    s.listOneOnOnes.mockResolvedValue({ items: [], total: 0 } as never);

    await fetchOneOnOnes({
      search: '山田',
      employeeId: EMP_ID,
      interviewerId: INTERVIEWER_ID,
      sort: 'createdAt',
      order: 'asc',
    } as never);

    expect(s.listOneOnOnes).toHaveBeenCalledWith(ctxAdmin, {
      page: 1,
      perPage: 20,
      search: '山田',
      employeeId: EMP_ID,
      interviewerId: INTERVIEWER_ID,
      sort: 'createdAt',
      order: 'asc',
    });
  });

  it('wraps the raw service result in ok()', async () => {
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();
    const payload = { items: [{ id: RECORD_ID }], total: 1 };
    s.listOneOnOnes.mockResolvedValue(payload as never);

    expect(await fetchOneOnOnes(defaultQuery as never)).toEqual(ok(payload));
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();
    s.listOneOnOnes.mockRejectedValue(new AuthorizationError('read', 'one_on_one'));

    expect(await fetchOneOnOnes(defaultQuery as never)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    const { fetchOneOnOnes } = await import(ACTIONS);
    const s = await svc();
    s.listOneOnOnes.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchOneOnOnes(defaultQuery as never)).rejects.toThrow('connection terminated');
  });

  it('rethrows failures raised while resolving the auth context', async () => {
    const { fetchOneOnOnes } = await import(ACTIONS);
    getAuthContext.mockRejectedValue(new Error('no session'));

    await expect(fetchOneOnOnes(defaultQuery as never)).rejects.toThrow('no session');
  });
});

describe('createOneOnOneAction', () => {
  it('rejects a non-UUID employeeId with its own message', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, employeeId: '' });

    expect(result).toEqual(err('対象従業員を選択してください'));
    expect(s.createOneOnOne).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID interviewerId with its own message', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, interviewerId: 'nope' });

    expect(result).toEqual(err('面談者を選択してください'));
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a date that is not YYYY-MM-DD', async () => {
    // heldOn は文字列のまま date 列に入るため、形式崩れを通すと
    // Postgres 例外（=500）になる。
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, heldOn: '2026-8-1' });

    expect(result).toEqual(err('日付は YYYY-MM-DD 形式で入力してください'));
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects notes longer than 5000 characters', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, notes: 'あ'.repeat(5001) });

    expect(result).toEqual(err('メモは5000文字以内で入力してください'));
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it.each([0, 1, 5])('accepts the in-range moodScore %s as-is', async (moodScore) => {
    // create 側は min(0) なので 0 も「有効な入力」として Service に渡る
    // （update 側は 0 を undefined に潰す）。この非対称は意図的か要確認だが、
    // 現状の契約として境界 0 / 1 / 5 を固定する。
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(ok({ id: RECORD_ID }) as never);

    await createOneOnOneAction({ ...validCreate, moodScore });

    expect(s.createOneOnOne).toHaveBeenCalledWith(ctxAdmin, { ...validCreate, moodScore });
  });

  it('rejects a moodScore of 6 with the Japanese upper-bound message', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, moodScore: 6 });

    expect(result).toEqual(err('コンディションは5以下で入力してください'));
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a negative moodScore', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, moodScore: -1 });

    expect(result.success).toBe(false);
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a fractional moodScore', async () => {
    // int() 制約。小数が入ると平均コンディションの推移グラフが崩れる。
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, moodScore: 3.5 });

    expect(result.success).toBe(false);
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a moodScore sent as a string (create does not coerce)', async () => {
    // update 側は coerce するが create 側はしない。この非対称を固定しておかないと
    // 同じフォーム部品を使い回したときに片方だけ落ちる事故に気づけない。
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createOneOnOneAction({ ...validCreate, moodScore: '3' });

    expect(result.success).toBe(false);
    expect(s.createOneOnOne).not.toHaveBeenCalled();
  });

  it('omits moodScore entirely when it is not provided', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(ok({ id: RECORD_ID }) as never);

    await createOneOnOneAction(validCreate);

    expect(s.createOneOnOne).toHaveBeenCalledWith(ctxAdmin, validCreate);
  });

  it('accepts empty notes so the field can be left blank', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(ok({ id: RECORD_ID }) as never);

    await createOneOnOneAction({ ...validCreate, notes: '' });

    expect(s.createOneOnOne).toHaveBeenCalledWith(ctxAdmin, { ...validCreate, notes: '' });
  });

  it('allows the employee and the interviewer to be the same person', async () => {
    // employeeId === interviewerId を禁じる制約はスキーマにも Service にも無い。
    // 自己記録という使い方が成立するため現状は許容。将来禁止するなら
    // このテストが変更の検知点になる。
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(ok({ id: RECORD_ID }) as never);

    const result = await createOneOnOneAction({
      ...validCreate,
      interviewerId: EMP_ID,
    });

    expect(result.success).toBe(true);
    expect(s.createOneOnOne).toHaveBeenCalledWith(
      ctxAdmin,
      expect.objectContaining({ employeeId: EMP_ID, interviewerId: EMP_ID }),
    );
  });

  it('strips unknown keys before they reach the service', async () => {
    // orgId をクライアントから注入させないことがテナント分離の前提。
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(ok({ id: RECORD_ID }) as never);

    await createOneOnOneAction({ ...validCreate, orgId: 'org-injected', id: 'forced-id' });

    expect(s.createOneOnOne).toHaveBeenCalledWith(ctxAdmin, validCreate);
  });

  it('revalidates the list page on success', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(ok({ id: RECORD_ID }) as never);

    const result = await createOneOnOneAction(validCreate);

    expect(result).toEqual(ok({ id: RECORD_ID }));
    expect(revalidatePath).toHaveBeenCalledWith('/one-on-ones');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockResolvedValue(err('対象従業員が見つかりません') as never);

    const result = await createOneOnOneAction(validCreate);

    expect(result).toEqual(err('対象従業員が見つかりません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockRejectedValue(new AuthorizationError('create', 'one_on_one'));

    expect(await createOneOnOneAction(validCreate)).toEqual(err('権限がありません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    const { createOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.createOneOnOne.mockRejectedValue(new Error('deadlock detected'));

    await expect(createOneOnOneAction(validCreate)).rejects.toThrow('deadlock detected');
  });
});

describe('updateOneOnOneAction', () => {
  it('rejects a non-UUID id without touching the service', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, id: 'not-a-uuid' });

    expect(result.success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('requires employeeId, interviewerId and heldOn (unlike create, nothing is optional here)', async () => {
    // 更新は全項目置換なので、欠けたまま通すと既存値が消える。
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    expect((await updateOneOnOneAction({ id: RECORD_ID })).success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('forwards a moodScore of 0 as-is (0 means "not rated")', async () => {
    // UI の未選択が 0 として届く。スキーマは 0 をそのまま通し、
    // null への変換は Service が担う（DB の CHECK 制約は 1〜5）。
    // create / update で 0 の意味を揃えるための責務分離。
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(ok(undefined) as never);

    await updateOneOnOneAction({ ...validUpdate, moodScore: 0 });

    expect(s.updateOneOnOne).toHaveBeenCalledWith(ctxAdmin, { ...validUpdate, moodScore: 0 });
  });

  it.each([1, 5])('keeps the in-range moodScore %s', async (moodScore) => {
    // 0 を潰す変換が、正当な下限 1 まで巻き込んでいないことの確認。
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(ok(undefined) as never);

    await updateOneOnOneAction({ ...validUpdate, moodScore });

    expect(s.updateOneOnOne).toHaveBeenCalledWith(ctxAdmin, { ...validUpdate, moodScore });
  });

  it('rejects a moodScore of 6', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, moodScore: 6 });

    expect(result.success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a negative moodScore rather than treating it as "not rated"', async () => {
    // -1 は 0 リテラル分岐に入らないので、そのまま拒否されるのが正しい。
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, moodScore: -1 });

    expect(result.success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a fractional moodScore', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, moodScore: 3.5 });

    expect(result.success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('rejects a numeric string moodScore without reaching the service', async () => {
    // 以前は update だけが z.coerce を持ち、文字列 '3' の可否が
    // create と食い違っていた。契約を統一し、どちらも数値のみ受け付ける。
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, moodScore: '3' });

    expect(result.success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
  ])('rejects moodScore given as %s', async (_label, moodScore) => {
    // z.coerce は null / '' を 0 に変換するが、0 リテラル分岐は生の入力を
    // 見るためマッチせず、min(1) 違反として弾かれる。「未入力」を表したい
    // 場合はキーごと省くか 0 を渡す必要がある、という契約を固定する。
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, moodScore });

    expect(result.success).toBe(false);
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('omits moodScore entirely when it is not provided', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(ok(undefined) as never);

    await updateOneOnOneAction(validUpdate);

    expect(s.updateOneOnOne).toHaveBeenCalledWith(ctxAdmin, validUpdate);
  });

  it('rejects notes longer than 5000 characters', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateOneOnOneAction({ ...validUpdate, notes: 'あ'.repeat(5001) });

    expect(result).toEqual(err('メモは5000文字以内で入力してください'));
    expect(s.updateOneOnOne).not.toHaveBeenCalled();
  });

  it('accepts empty notes so an existing memo can be cleared', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(ok(undefined) as never);

    await updateOneOnOneAction({ ...validUpdate, notes: '' });

    expect(s.updateOneOnOne).toHaveBeenCalledWith(ctxAdmin, { ...validUpdate, notes: '' });
  });

  it('allows the employee and the interviewer to be the same person', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(ok(undefined) as never);

    const result = await updateOneOnOneAction({ ...validUpdate, interviewerId: EMP_ID });

    expect(result.success).toBe(true);
  });

  it('revalidates the list page on success', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(ok(undefined) as never);

    expect(await updateOneOnOneAction(validUpdate)).toEqual(ok(undefined));
    expect(revalidatePath).toHaveBeenCalledWith('/one-on-ones');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockResolvedValue(err('1on1記録が見つかりません') as never);

    expect((await updateOneOnOneAction(validUpdate)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockRejectedValue(new AuthorizationError('update', 'one_on_one'));

    expect(await updateOneOnOneAction(validUpdate)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { updateOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.updateOneOnOne.mockRejectedValue(new Error('boom'));

    await expect(updateOneOnOneAction(validUpdate)).rejects.toThrow('boom');
  });
});

describe('deleteOneOnOneAction', () => {
  it('revalidates on success', async () => {
    const { deleteOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteOneOnOne.mockResolvedValue(ok(undefined) as never);

    expect(await deleteOneOnOneAction(RECORD_ID)).toEqual(ok(undefined));
    expect(s.deleteOneOnOne).toHaveBeenCalledWith(ctxAdmin, RECORD_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/one-on-ones');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { deleteOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteOneOnOne.mockResolvedValue(err('1on1記録が見つかりません') as never);

    expect((await deleteOneOnOneAction(RECORD_ID)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID id before reaching the service', async () => {
    // 非 UUID が Postgres の uuid 比較に渡ると型エラーで 500 になる。
    const { deleteOneOnOneAction } = await import(ACTIONS);
    const s = await svc();

    expect(await deleteOneOnOneAction('not-a-uuid')).toEqual(err('無効な1on1記録IDです'));
    expect(s.deleteOneOnOne).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { deleteOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteOneOnOne.mockRejectedValue(new AuthorizationError('delete', 'one_on_one'));

    expect(await deleteOneOnOneAction(RECORD_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { deleteOneOnOneAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteOneOnOne.mockRejectedValue(new Error('boom'));

    await expect(deleteOneOnOneAction(RECORD_ID)).rejects.toThrow('boom');
  });
});

describe('fetchEmployeeOptions', () => {
  it('returns the employee options from the service', async () => {
    const { fetchEmployeeOptions } = await import(ACTIONS);
    const s = await svc();
    const options = [{ id: EMP_ID, fullName: '山田 太郎' }];
    s.getEmployeesForOrg.mockResolvedValue(options as never);

    expect(await fetchEmployeeOptions()).toEqual(options);
    expect(s.getEmployeesForOrg).toHaveBeenCalledWith(ctxAdmin);
  });

  it('degrades to an empty list when not permitted', async () => {
    // セレクタの選択肢という付随情報なので、権限が無い場合は
    // 画面全体をエラーにせず空で返す設計。
    const { fetchEmployeeOptions } = await import(ACTIONS);
    const s = await svc();
    s.getEmployeesForOrg.mockRejectedValue(new AuthorizationError('read', 'employee'));

    expect(await fetchEmployeeOptions()).toEqual([]);
  });

  it('rethrows unexpected errors', async () => {
    // 空配列に潰してよいのは権限エラーだけ。DB 障害まで空にすると
    // 「従業員が0人」と誤認させ、原因究明も遅れる。
    const { fetchEmployeeOptions } = await import(ACTIONS);
    const s = await svc();
    s.getEmployeesForOrg.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchEmployeeOptions()).rejects.toThrow('connection terminated');
  });
});
