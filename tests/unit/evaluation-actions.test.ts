import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, err } from '@/lib/result';
import { AuthorizationError } from '@/services/authorize';

import { ctxAdmin } from '../helpers/auth-fixtures';

/**
 * 評価ドメインの Server Actions。
 *
 * Server Actions は「UI から届いた未検証の値」を最初に受け取る層であり、
 * 実質的な入力境界。各アクションは以下の定型構造を持つ。
 *
 *   1. Zod バリデーション失敗 → err(最初のメッセージ)。Service は呼ばれない
 *   2. 正常系              → Service Layer の結果をそのまま返す
 *   3. 成功時のみ            revalidatePath('/evaluations') を呼ぶ
 *   4. AuthorizationError  → err('権限がありません')
 *   5. それ以外の例外        → 握り潰さず再 throw
 *
 * 5 が最重要。ここを握り潰すと DB 障害が「操作は失敗したが理由不明」として
 * ユーザーに見えてしまい、監視にも乗らない。全アクションで経路を通す。
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const { getAuthContext } = vi.hoisted(() => ({ getAuthContext: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth', () => ({ getAuthContext }));

vi.mock('@/services/evaluation', () => ({
  listCycles: vi.fn(),
  getCycle: vi.fn(),
  createCycle: vi.fn(),
  updateCycle: vi.fn(),
  deleteCycle: vi.fn(),
  createEvaluation: vi.fn(),
  updateEvaluation: vi.fn(),
  deleteEvaluation: vi.fn(),
}));

// fetchEmployeeOptions だけは 1on1 の Service を借りている（従業員セレクタ共通化）。
vi.mock('@/services/one-on-one', () => ({
  getEmployeesForOrg: vi.fn(),
}));

const ACTIONS = '@/app/(dashboard)/evaluations/actions';

async function svc() {
  return vi.mocked(await import('@/services/evaluation'));
}

async function oooSvc() {
  return vi.mocked(await import('@/services/one-on-one'));
}

const CYCLE_ID = '11111111-1111-4111-8111-111111111111';
const EMP_ID = '22222222-2222-4222-8222-222222222222';
const EVALUATOR_ID = '33333333-3333-4333-8333-333333333333';
const EVAL_ID = '44444444-4444-4444-8444-444444444444';

const validCycle = {
  name: '2026年度上期',
  periodStart: '2026-04-01',
  periodEnd: '2026-09-30',
};

const validCycleUpdate = { id: CYCLE_ID, ...validCycle, status: 'in_progress' as const };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContext.mockResolvedValue(ctxAdmin);
});

describe('fetchCycles', () => {
  it('wraps the raw service list in ok()', async () => {
    // listCycles は Result ではなく生配列を返す Service なので、
    // アクション側で ok() に包む責務がある。包み忘れると UI が
    // result.data を読めず一覧が空になる。
    const { fetchCycles } = await import(ACTIONS);
    const s = await svc();
    const cycles = [{ id: CYCLE_ID, name: '2026年度上期', evaluationCount: 3 }];
    s.listCycles.mockResolvedValue(cycles as never);

    const result = await fetchCycles();

    expect(result).toEqual(ok(cycles));
    expect(s.listCycles).toHaveBeenCalledWith(ctxAdmin);
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchCycles } = await import(ACTIONS);
    const s = await svc();
    s.listCycles.mockRejectedValue(new AuthorizationError('read', 'evaluation_cycle'));

    expect(await fetchCycles()).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    const { fetchCycles } = await import(ACTIONS);
    const s = await svc();
    s.listCycles.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchCycles()).rejects.toThrow('connection terminated');
  });

  it('rethrows failures raised while resolving the auth context', async () => {
    // getAuthContext は try の内側にある。セッション解決の失敗（未ログイン等）は
    // AuthorizationError ではないため、握り潰さず上位に伝わる必要がある。
    const { fetchCycles } = await import(ACTIONS);
    getAuthContext.mockRejectedValue(new Error('no session'));

    await expect(fetchCycles()).rejects.toThrow('no session');
  });
});

describe('fetchCycleDetail', () => {
  it('returns the service Result as-is without re-wrapping', async () => {
    // getCycle は既に Result を返すので、ここで ok() に包むと
    // Result が二重になり UI の分岐が壊れる。素通しであることを固定する。
    const { fetchCycleDetail } = await import(ACTIONS);
    const s = await svc();
    const detail = { cycle: { id: CYCLE_ID }, evaluations: [] };
    s.getCycle.mockResolvedValue(ok(detail) as never);

    const result = await fetchCycleDetail(CYCLE_ID);

    expect(result).toEqual(ok(detail));
    expect(s.getCycle).toHaveBeenCalledWith(ctxAdmin, CYCLE_ID);
  });

  it('passes the service failure straight through', async () => {
    const { fetchCycleDetail } = await import(ACTIONS);
    const s = await svc();
    s.getCycle.mockResolvedValue(err('評価サイクルが見つかりません') as never);

    expect(await fetchCycleDetail(CYCLE_ID)).toEqual(err('評価サイクルが見つかりません'));
  });

  it('rejects a non-UUID id before reaching the service', async () => {
    // 非 UUID が Postgres の uuid 比較に渡ると型エラーで 500 になる。
    // org_id スコープがあるので漏洩はしないが、UI には日本語のエラーを返す。
    const { fetchCycleDetail } = await import(ACTIONS);
    const s = await svc();

    expect(await fetchCycleDetail('not-a-uuid')).toEqual(err('無効な評価サイクルIDです'));
    expect(s.getCycle).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { fetchCycleDetail } = await import(ACTIONS);
    const s = await svc();
    s.getCycle.mockRejectedValue(new AuthorizationError('read', 'evaluation_cycle'));

    expect(await fetchCycleDetail(CYCLE_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { fetchCycleDetail } = await import(ACTIONS);
    const s = await svc();
    s.getCycle.mockRejectedValue(new Error('boom'));

    await expect(fetchCycleDetail(CYCLE_ID)).rejects.toThrow('boom');
  });
});

describe('createCycleAction', () => {
  it('rejects a blank name with the schema message and skips the service', async () => {
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createCycleAction({ ...validCycle, name: '' });

    expect(result).toEqual(err('評価サイクル名を入力してください'));
    expect(s.createCycle).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a name longer than 100 characters', async () => {
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createCycleAction({ ...validCycle, name: 'あ'.repeat(101) });

    expect(result).toEqual(err('評価サイクル名は100文字以内で入力してください'));
    expect(s.createCycle).not.toHaveBeenCalled();
  });

  it('rejects a date that is not YYYY-MM-DD', async () => {
    // 日付は文字列のまま DB の date 列に入るため、形式崩れを
    // ここで止められないと Postgres 例外（=500）になる。
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createCycleAction({ ...validCycle, periodStart: '2026/04/01' });

    expect(result).toEqual(err('日付は YYYY-MM-DD 形式で入力してください'));
    expect(s.createCycle).not.toHaveBeenCalled();
  });

  it('rejects extraneous input only through the schema, passing parsed data to the service', async () => {
    // Zod の strip により未知キーは Service に届かない。
    // 届いてしまうと Drizzle の insert が想定外の列を持つ危険がある。
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.createCycle.mockResolvedValue(ok({ id: CYCLE_ID }) as never);

    await createCycleAction({ ...validCycle, orgId: 'org-injected', status: 'completed' });

    expect(s.createCycle).toHaveBeenCalledWith(ctxAdmin, validCycle);
  });

  it('revalidates the evaluations page on success', async () => {
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.createCycle.mockResolvedValue(ok({ id: CYCLE_ID }) as never);

    const result = await createCycleAction(validCycle);

    expect(result).toEqual(ok({ id: CYCLE_ID }));
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.createCycle.mockResolvedValue(err('同名の評価サイクルが既に存在します') as never);

    const result = await createCycleAction(validCycle);

    expect(result).toEqual(err('同名の評価サイクルが既に存在します'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a period whose end precedes its start without reaching the service', async () => {
    // 回帰防止。逆転した期間が保存されると、一覧の並び（periodStart 降順）や
    // 期間内集計が壊れる。Service に到達させないこと自体が要件。
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createCycleAction({
      name: '逆転期間',
      periodStart: '2026-09-30',
      periodEnd: '2026-04-01',
    });

    expect(result).toEqual(err('終了日は開始日以降の日付を指定してください'));
    expect(s.createCycle).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.createCycle.mockRejectedValue(new AuthorizationError('create', 'evaluation_cycle'));

    expect(await createCycleAction(validCycle)).toEqual(err('権限がありません'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    const { createCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.createCycle.mockRejectedValue(new Error('deadlock detected'));

    await expect(createCycleAction(validCycle)).rejects.toThrow('deadlock detected');
  });
});

describe('updateCycleAction', () => {
  it('rejects a non-UUID id without touching the service', async () => {
    const { updateCycleAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateCycleAction({ ...validCycleUpdate, id: 'not-a-uuid' });

    expect(result.success).toBe(false);
    expect(s.updateCycle).not.toHaveBeenCalled();
  });

  it('rejects a status outside the cycle enum', async () => {
    // ステータスは DB の enum と 1:1。未知の値を通すと insert が落ちる。
    const { updateCycleAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateCycleAction({ ...validCycleUpdate, status: 'archived' });

    expect(result.success).toBe(false);
    expect(s.updateCycle).not.toHaveBeenCalled();
  });

  it.each(['draft', 'in_progress', 'completed'] as const)(
    'accepts the %s status and forwards it to the service',
    async (status) => {
      const { updateCycleAction } = await import(ACTIONS);
      const s = await svc();
      s.updateCycle.mockResolvedValue(ok(undefined) as never);

      const result = await updateCycleAction({ ...validCycleUpdate, status });

      expect(result).toEqual(ok(undefined));
      expect(s.updateCycle).toHaveBeenCalledWith(ctxAdmin, { ...validCycleUpdate, status });
      expect(revalidatePath).toHaveBeenCalledWith('/evaluations');
    },
  );

  it('does not revalidate when the service reports failure', async () => {
    const { updateCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.updateCycle.mockResolvedValue(err('評価サイクルが見つかりません') as never);

    expect((await updateCycleAction(validCycleUpdate)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { updateCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.updateCycle.mockRejectedValue(new AuthorizationError('update', 'evaluation_cycle'));

    expect(await updateCycleAction(validCycleUpdate)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { updateCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.updateCycle.mockRejectedValue(new Error('boom'));

    await expect(updateCycleAction(validCycleUpdate)).rejects.toThrow('boom');
  });
});

describe('deleteCycleAction', () => {
  it('rejects a non-UUID id before reaching the service', async () => {
    const { deleteCycleAction } = await import(ACTIONS);
    const s = await svc();

    expect(await deleteCycleAction('not-a-uuid')).toEqual(err('無効な評価サイクルIDです'));
    expect(s.deleteCycle).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates on success', async () => {
    const { deleteCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteCycle.mockResolvedValue(ok(undefined) as never);

    expect(await deleteCycleAction(CYCLE_ID)).toEqual(ok(undefined));
    expect(s.deleteCycle).toHaveBeenCalledWith(ctxAdmin, CYCLE_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations');
  });

  it('does not revalidate when deletion is blocked by the service', async () => {
    // 評価が紐づくサイクルは削除できない等、Service の業務ルールで
    // 失敗したときにキャッシュを飛ばすと、消えていないのに一覧が
    // 再取得されて無駄な負荷になる。
    const { deleteCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteCycle.mockResolvedValue(err('評価サイクルが見つかりません') as never);

    expect((await deleteCycleAction(CYCLE_ID)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { deleteCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteCycle.mockRejectedValue(new AuthorizationError('delete', 'evaluation_cycle'));

    expect(await deleteCycleAction(CYCLE_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { deleteCycleAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteCycle.mockRejectedValue(new Error('boom'));

    await expect(deleteCycleAction(CYCLE_ID)).rejects.toThrow('boom');
  });
});

describe('createEvaluationAction', () => {
  const validEval = { cycleId: CYCLE_ID, employeeId: EMP_ID, evaluatorId: EVALUATOR_ID };

  it.each([
    ['cycleId', '評価サイクルを選択してください'],
    ['employeeId', '対象従業員を選択してください'],
    ['evaluatorId', '評価者を選択してください'],
  ] as const)('rejects a non-UUID %s with its own message', async (field, message) => {
    // フィールドごとに固有メッセージを持たせているのは、
    // フォームのどのセレクタが未選択かをユーザーに示すため。
    const { createEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await createEvaluationAction({ ...validEval, [field]: '' });

    expect(result).toEqual(err(message));
    expect(s.createEvaluation).not.toHaveBeenCalled();
  });

  it('creates and revalidates on success', async () => {
    const { createEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.createEvaluation.mockResolvedValue(ok({ id: EVAL_ID }) as never);

    const result = await createEvaluationAction(validEval);

    expect(result).toEqual(ok({ id: EVAL_ID }));
    expect(s.createEvaluation).toHaveBeenCalledWith(ctxAdmin, validEval);
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations');
  });

  it('allows an employee to be their own evaluator (self-assessment)', async () => {
    // employeeId === evaluatorId を禁じる制約はスキーマにも Service にも無い。
    // 自己評価というユースケースが成立するため許容だが、意図しない
    // 自己評価を防ぐ制約を将来入れる場合はこのテストが検知点になる。
    const { createEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.createEvaluation.mockResolvedValue(ok({ id: EVAL_ID }) as never);

    const result = await createEvaluationAction({
      cycleId: CYCLE_ID,
      employeeId: EMP_ID,
      evaluatorId: EMP_ID,
    });

    expect(result.success).toBe(true);
    expect(s.createEvaluation).toHaveBeenCalledWith(ctxAdmin, {
      cycleId: CYCLE_ID,
      employeeId: EMP_ID,
      evaluatorId: EMP_ID,
    });
  });

  it('does not revalidate when the pair already exists', async () => {
    const { createEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.createEvaluation.mockResolvedValue(err('この組み合わせの評価は既に存在します') as never);

    const result = await createEvaluationAction(validEval);

    expect(result).toEqual(err('この組み合わせの評価は既に存在します'));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { createEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.createEvaluation.mockRejectedValue(new AuthorizationError('create', 'evaluation'));

    expect(await createEvaluationAction(validEval)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { createEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.createEvaluation.mockRejectedValue(new Error('boom'));

    await expect(createEvaluationAction(validEval)).rejects.toThrow('boom');
  });
});

describe('updateEvaluationAction', () => {
  it('rejects a non-UUID id without touching the service', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateEvaluationAction({ id: 'not-a-uuid' });

    expect(result.success).toBe(false);
    expect(s.updateEvaluation).not.toHaveBeenCalled();
  });

  it('accepts an id-only payload (every other field is optional)', async () => {
    // 部分更新のためすべて optional。id だけでも通り、Service 側は
    // 「変更なし」として扱う。ここが落ちると自動保存が壊れる。
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockResolvedValue(ok(undefined) as never);

    const result = await updateEvaluationAction({ id: EVAL_ID });

    expect(result).toEqual(ok(undefined));
    expect(s.updateEvaluation).toHaveBeenCalledWith(ctxAdmin, { id: EVAL_ID });
  });

  it('accepts an empty ratings object', async () => {
    // 評価項目は任意なので {} は正当な入力。誤って
    // 「1件以上」を強制すると評価の下書き保存ができなくなる。
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockResolvedValue(ok(undefined) as never);

    await updateEvaluationAction({ id: EVAL_ID, ratings: {} });

    expect(s.updateEvaluation).toHaveBeenCalledWith(ctxAdmin, { id: EVAL_ID, ratings: {} });
  });

  it('accepts arbitrary rating keys within the 1-5 range', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockResolvedValue(ok(undefined) as never);

    const ratings = { technical: 1, communication: 5, 日本語キー: 3 };
    await updateEvaluationAction({ id: EVAL_ID, ratings });

    expect(s.updateEvaluation).toHaveBeenCalledWith(ctxAdmin, { id: EVAL_ID, ratings });
  });

  it.each([0, 6, -1, 100])('rejects the out-of-range rating value %s', async (value) => {
    // 範囲外の点数が DB に入ると集計（平均・分布）が破綻する。
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateEvaluationAction({ id: EVAL_ID, ratings: { technical: value } });

    expect(result.success).toBe(false);
    expect(s.updateEvaluation).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric rating value', async () => {
    // フォームの生値は文字列になりがちだが、このスキーマは coerce しない。
    // 数値化はクライアント側の責務であることを固定する。
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateEvaluationAction({ id: EVAL_ID, ratings: { technical: '5' } });

    expect(result.success).toBe(false);
    expect(s.updateEvaluation).not.toHaveBeenCalled();
  });

  it('rejects a fractional rating without reaching the service', async () => {
    // 回帰防止。評価点は 1〜5 の離散値であり、小数が保存されると
    // 平均・分布の集計が UI の前提と食い違う。
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateEvaluationAction({ id: EVAL_ID, ratings: { technical: 3.5 } });

    expect(result).toEqual(err('評価点は整数で入力してください'));
    expect(s.updateEvaluation).not.toHaveBeenCalled();
  });

  it('still accepts integer ratings at both ends of the range', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockResolvedValue(ok(undefined) as never);

    const result = await updateEvaluationAction({
      id: EVAL_ID,
      ratings: { performance: 1, competency: 5 },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a comment longer than 5000 characters', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateEvaluationAction({ id: EVAL_ID, comment: 'あ'.repeat(5001) });

    expect(result).toEqual(err('コメントは5000文字以内で入力してください'));
    expect(s.updateEvaluation).not.toHaveBeenCalled();
  });

  it('accepts an empty comment so a filled-in comment can be cleared', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockResolvedValue(ok(undefined) as never);

    await updateEvaluationAction({ id: EVAL_ID, comment: '' });

    expect(s.updateEvaluation).toHaveBeenCalledWith(ctxAdmin, { id: EVAL_ID, comment: '' });
  });

  it.each(['draft', 'in_progress', 'submitted', 'confirmed', 'returned'] as const)(
    'accepts the %s evaluation status',
    async (status) => {
      const { updateEvaluationAction } = await import(ACTIONS);
      const s = await svc();
      s.updateEvaluation.mockResolvedValue(ok(undefined) as never);

      const result = await updateEvaluationAction({ id: EVAL_ID, status });

      expect(result.success).toBe(true);
      expect(s.updateEvaluation).toHaveBeenCalledWith(ctxAdmin, { id: EVAL_ID, status });
    },
  );

  it('rejects a status outside the evaluation enum', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    const result = await updateEvaluationAction({ id: EVAL_ID, status: 'approved' });

    expect(result.success).toBe(false);
    expect(s.updateEvaluation).not.toHaveBeenCalled();
  });

  it('revalidates only on success', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockResolvedValue(err('評価が見つかりません') as never);

    expect((await updateEvaluationAction({ id: EVAL_ID })).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();

    s.updateEvaluation.mockResolvedValue(ok(undefined) as never);
    await updateEvaluationAction({ id: EVAL_ID });
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations');
  });

  it('converts AuthorizationError into a permission error', async () => {
    // 確定済み評価の編集など、ロールによる拒否がここに出る。
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockRejectedValue(new AuthorizationError('update', 'evaluation'));

    expect(await updateEvaluationAction({ id: EVAL_ID })).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { updateEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.updateEvaluation.mockRejectedValue(new Error('boom'));

    await expect(updateEvaluationAction({ id: EVAL_ID })).rejects.toThrow('boom');
  });
});

describe('deleteEvaluationAction', () => {
  it('rejects a non-UUID id before reaching the service', async () => {
    const { deleteEvaluationAction } = await import(ACTIONS);
    const s = await svc();

    expect(await deleteEvaluationAction('not-a-uuid')).toEqual(err('無効な評価IDです'));
    expect(s.deleteEvaluation).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates on success', async () => {
    const { deleteEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteEvaluation.mockResolvedValue(ok(undefined) as never);

    expect(await deleteEvaluationAction(EVAL_ID)).toEqual(ok(undefined));
    expect(s.deleteEvaluation).toHaveBeenCalledWith(ctxAdmin, EVAL_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/evaluations');
  });

  it('does not revalidate when the service reports failure', async () => {
    const { deleteEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteEvaluation.mockResolvedValue(err('評価が見つかりません') as never);

    expect((await deleteEvaluationAction(EVAL_ID)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('converts AuthorizationError into a permission error', async () => {
    const { deleteEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteEvaluation.mockRejectedValue(new AuthorizationError('delete', 'evaluation'));

    expect(await deleteEvaluationAction(EVAL_ID)).toEqual(err('権限がありません'));
  });

  it('rethrows unexpected errors', async () => {
    const { deleteEvaluationAction } = await import(ACTIONS);
    const s = await svc();
    s.deleteEvaluation.mockRejectedValue(new Error('boom'));

    await expect(deleteEvaluationAction(EVAL_ID)).rejects.toThrow('boom');
  });
});

describe('fetchEmployeeOptions', () => {
  it('returns the employee options from the shared 1on1 service', async () => {
    const { fetchEmployeeOptions } = await import(ACTIONS);
    const o = await oooSvc();
    const options = [{ id: EMP_ID, fullName: '山田 太郎' }];
    o.getEmployeesForOrg.mockResolvedValue(options as never);

    expect(await fetchEmployeeOptions()).toEqual(options);
    expect(o.getEmployeesForOrg).toHaveBeenCalledWith(ctxAdmin);
  });

  it('degrades to an empty list when not permitted', async () => {
    // セレクタの選択肢という付随情報なので、権限が無い場合は
    // 画面全体をエラーにせず空で返す設計。
    const { fetchEmployeeOptions } = await import(ACTIONS);
    const o = await oooSvc();
    o.getEmployeesForOrg.mockRejectedValue(new AuthorizationError('read', 'employee'));

    expect(await fetchEmployeeOptions()).toEqual([]);
  });

  it('rethrows unexpected errors', async () => {
    // 空配列に潰してよいのは権限エラーだけ。DB 障害まで空にすると
    // 「従業員が0人」と誤認させる。
    const { fetchEmployeeOptions } = await import(ACTIONS);
    const o = await oooSvc();
    o.getEmployeesForOrg.mockRejectedValue(new Error('connection terminated'));

    await expect(fetchEmployeeOptions()).rejects.toThrow('connection terminated');
  });
});
