import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';

import {
  createCycleSchema,
  createEvaluationSchema,
  cycleStatus,
  evaluationStatus,
  updateCycleSchema,
  updateEvaluationSchema,
} from '@/lib/validations/evaluation';
import {
  createOneOnOneSchema,
  oneOnOneListQuerySchema,
  updateOneOnOneSchema,
} from '@/lib/validations/one-on-one';

function issuesByPath(error: ZodError): Record<string, { code: string; message: string }> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.join('.'),
      { code: issue.code as string, message: issue.message },
    ]),
  );
}

const VALID_UUID = '3f9d2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5f';
const OTHER_UUID = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
const THIRD_UUID = 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f';

describe('evaluation validations', () => {
  describe('cycleStatus / evaluationStatus', () => {
    it.each(['draft', 'in_progress', 'completed'])(
      'サイクルステータス %s を受け付ける',
      (status) => {
        expect(cycleStatus.safeParse(status).success).toBe(true);
      },
    );

    it('サイクルに評価用ステータス（submitted）は使えない（2つの enum の混同を防ぐ）', () => {
      expect(cycleStatus.safeParse('submitted').success).toBe(false);
    });

    it.each(['draft', 'in_progress', 'submitted', 'confirmed', 'returned'])(
      '評価ステータス %s を受け付ける',
      (status) => {
        expect(evaluationStatus.safeParse(status).success).toBe(true);
      },
    );

    it('定義外の評価ステータスを弾く', () => {
      const result = evaluationStatus.safeParse('approved');

      expect(result.success).toBe(false);
      expect(result.error!.issues[0].code).toBe('invalid_value');
    });
  });

  describe('createCycleSchema', () => {
    it('名称と期間が揃っていれば通る', () => {
      const input = { name: '2024上期', periodStart: '2024-04-01', periodEnd: '2024-09-30' };
      const result = createCycleSchema.safeParse(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    it('名称の空文字を弾く', () => {
      const result = createCycleSchema.safeParse({
        name: '',
        periodStart: '2024-04-01',
        periodEnd: '2024-09-30',
      });

      expect(issuesByPath(result.error!)['name']).toEqual({
        code: 'too_small',
        message: '評価サイクル名を入力してください',
      });
    });

    it('名称は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
      const dates = { periodStart: '2024-04-01', periodEnd: '2024-09-30' };
      expect(createCycleSchema.safeParse({ name: 'x'.repeat(100), ...dates }).success).toBe(true);

      const tooLong = createCycleSchema.safeParse({ name: 'x'.repeat(101), ...dates });
      expect(issuesByPath(tooLong.error!)['name']).toEqual({
        code: 'too_big',
        message: '評価サイクル名は100文字以内で入力してください',
      });
    });

    it('期間の未指定を弾く（開始・終了とも必須）', () => {
      const result = createCycleSchema.safeParse({ name: '2024上期' });

      expect(result.success).toBe(false);
      const issues = issuesByPath(result.error!);
      expect(issues['periodStart'].code).toBe('invalid_type');
      expect(issues['periodEnd'].code).toBe('invalid_type');
    });

    it('期間の空文字を弾く（任意項目と違い空文字の逃げ道がない）', () => {
      const result = createCycleSchema.safeParse({
        name: '2024上期',
        periodStart: '',
        periodEnd: '2024-09-30',
      });

      expect(issuesByPath(result.error!)['periodStart']).toEqual({
        code: 'invalid_format',
        message: '日付は YYYY-MM-DD 形式で入力してください',
      });
    });

    it.each([
      ['スラッシュ区切り', '2024/04/01'],
      ['ゼロ埋めなし', '2024-4-1'],
      ['時刻付き', '2024-04-01T00:00:00Z'],
    ])('期間の不正な日付形式を弾く: %s', (_label, periodEnd) => {
      const result = createCycleSchema.safeParse({
        name: '2024上期',
        periodStart: '2024-04-01',
        periodEnd,
      });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['periodEnd'].message).toBe(
        '日付は YYYY-MM-DD 形式で入力してください',
      );
    });

    it('開始日が終了日より後の期間を弾く', () => {
      // 回帰防止。形式が正しくても逆転した期間は業務上ありえず、
      // 一覧は periodStart 降順で並ぶため並び順まで壊れる。
      const result = createCycleSchema.safeParse({
        name: '不正な期間',
        periodStart: '2024-12-31',
        periodEnd: '2024-01-01',
      });

      expect(result.success).toBe(false);
      expect(result.error!.issues[0].message).toBe('終了日は開始日以降の日付を指定してください');
      expect(result.error!.issues[0].path).toEqual(['periodEnd']);
    });

    it('開始日と終了日が同日の期間は許可する（境界値）', () => {
      // 1日だけのサイクルは業務上ありうるため、境界は「以降」であって「より後」ではない。
      const result = createCycleSchema.safeParse({
        name: '単日サイクル',
        periodStart: '2024-04-01',
        periodEnd: '2024-04-01',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('updateCycleSchema', () => {
    const valid = {
      id: VALID_UUID,
      name: '2024上期',
      periodStart: '2024-04-01',
      periodEnd: '2024-09-30',
      status: 'in_progress',
    };

    it('全項目が揃っていれば通る', () => {
      const result = updateCycleSchema.safeParse(valid);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(valid);
    });

    it.each(['draft', 'in_progress', 'completed'])('status %s へ更新できる', (status) => {
      expect(updateCycleSchema.safeParse({ ...valid, status }).success).toBe(true);
    });

    it('status 未指定を弾く（更新は全項目必須の全置換方式）', () => {
      const { status: _status, ...withoutStatus } = valid;
      const result = updateCycleSchema.safeParse(withoutStatus);

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['status'].code).toBe('invalid_value');
    });

    it('定義外の status を弾く', () => {
      const result = updateCycleSchema.safeParse({ ...valid, status: 'archived' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['status'].code).toBe('invalid_value');
    });

    it('id が UUID でなければ弾く', () => {
      const result = updateCycleSchema.safeParse({ ...valid, id: 'cycle-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });

    it('name は更新時も必須（省略できない）', () => {
      const { name: _name, ...withoutName } = valid;
      const result = updateCycleSchema.safeParse(withoutName);

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['name'].code).toBe('invalid_type');
    });
  });

  describe('createEvaluationSchema', () => {
    const valid = { cycleId: VALID_UUID, employeeId: OTHER_UUID, evaluatorId: THIRD_UUID };

    it('サイクル・対象者・評価者が揃っていれば通る', () => {
      const result = createEvaluationSchema.safeParse(valid);

      expect(result.data).toEqual(valid);
    });

    it.each([
      ['cycleId', '評価サイクルを選択してください'],
      ['employeeId', '対象従業員を選択してください'],
      ['evaluatorId', '評価者を選択してください'],
    ])('%s が UUID でなければ選択を促すメッセージを返す', (field, message) => {
      const result = createEvaluationSchema.safeParse({ ...valid, [field]: '' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)[field]).toEqual({ code: 'invalid_format', message });
    });

    it('全項目未指定なら3件エラーになる', () => {
      const result = createEvaluationSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error!.issues).toHaveLength(3);
    });

    it('評価者と対象者が同一でも通る（自己評価を許容する仕様）', () => {
      const result = createEvaluationSchema.safeParse({
        cycleId: VALID_UUID,
        employeeId: OTHER_UUID,
        evaluatorId: OTHER_UUID,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('updateEvaluationSchema', () => {
    it('id のみで通る（下書き保存で何も変更しない場合）', () => {
      const result = updateEvaluationSchema.safeParse({ id: VALID_UUID });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: VALID_UUID });
    });

    it('ratings は 1〜5 の数値マップを受け付ける（境界値の両端）', () => {
      const result = updateEvaluationSchema.safeParse({
        id: VALID_UUID,
        ratings: { technical: 1, communication: 5 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.ratings).toEqual({ technical: 1, communication: 5 });
    });

    it('ratings の 0 を弾く（境界値・下側。ネストした path まで報告されること）', () => {
      const result = updateEvaluationSchema.safeParse({
        id: VALID_UUID,
        ratings: { technical: 0 },
      });

      expect(result.success).toBe(false);
      expect(result.error!.issues[0].path).toEqual(['ratings', 'technical']);
      expect(result.error!.issues[0].code).toBe('too_small');
    });

    it('ratings の 6 を弾く（境界値・上側）', () => {
      const result = updateEvaluationSchema.safeParse({
        id: VALID_UUID,
        ratings: { technical: 6 },
      });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['ratings.technical'].code).toBe('too_big');
    });

    it('ratings の文字列値を弾く（coerce しないので "3" は不可）', () => {
      const result = updateEvaluationSchema.safeParse({
        id: VALID_UUID,
        ratings: { technical: '3' },
      });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['ratings.technical'].code).toBe('invalid_type');
    });

    it('空の ratings は通る（評価未入力の下書き保存を許容）', () => {
      const result = updateEvaluationSchema.safeParse({ id: VALID_UUID, ratings: {} });

      expect(result.success).toBe(true);
      expect(result.data?.ratings).toEqual({});
    });

    it('ratings の小数を弾く', () => {
      // 回帰防止。評価点は 1〜5 の離散値であり、小数が入ると
      // 平均・分布の集計が前提と食い違う。
      const result = updateEvaluationSchema.safeParse({
        id: VALID_UUID,
        ratings: { technical: 2.5 },
      });

      expect(result.success).toBe(false);
      expect(result.error!.issues[0].message).toBe('評価点は整数で入力してください');
    });

    it('ratings の 1 と 5 は許可し、0 と 6 を弾く（境界値）', () => {
      expect(
        updateEvaluationSchema.safeParse({ id: VALID_UUID, ratings: { a: 1, b: 5 } }).success,
      ).toBe(true);
      expect(updateEvaluationSchema.safeParse({ id: VALID_UUID, ratings: { a: 0 } }).success).toBe(
        false,
      );
      expect(updateEvaluationSchema.safeParse({ id: VALID_UUID, ratings: { a: 6 } }).success).toBe(
        false,
      );
    });

    it('comment は5000文字ちょうどまで、5001文字で弾かれる（境界値）', () => {
      expect(
        updateEvaluationSchema.safeParse({ id: VALID_UUID, comment: 'x'.repeat(5000) }).success,
      ).toBe(true);

      const tooLong = updateEvaluationSchema.safeParse({
        id: VALID_UUID,
        comment: 'x'.repeat(5001),
      });
      expect(issuesByPath(tooLong.error!)['comment']).toEqual({
        code: 'too_big',
        message: 'コメントは5000文字以内で入力してください',
      });
    });

    it('comment の空文字を許容する（コメントの消去操作）', () => {
      const result = updateEvaluationSchema.safeParse({ id: VALID_UUID, comment: '' });

      expect(result.success).toBe(true);
      expect(result.data?.comment).toBe('');
    });

    it('comment の null を弾く', () => {
      const result = updateEvaluationSchema.safeParse({ id: VALID_UUID, comment: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['comment'].code).toBe('invalid_union');
    });

    it.each(['draft', 'in_progress', 'submitted', 'confirmed', 'returned'])(
      'status %s への更新を受け付ける',
      (status) => {
        expect(updateEvaluationSchema.safeParse({ id: VALID_UUID, status }).success).toBe(true);
      },
    );

    it('定義外の status を弾く（ワークフロー外の状態遷移を防ぐ）', () => {
      const result = updateEvaluationSchema.safeParse({ id: VALID_UUID, status: 'completed' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['status'].code).toBe('invalid_value');
    });

    it('id が UUID でなければ弾く', () => {
      const result = updateEvaluationSchema.safeParse({ id: 'eval-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });
  });
});

describe('one-on-one validations', () => {
  const base = { employeeId: VALID_UUID, interviewerId: OTHER_UUID, heldOn: '2024-05-01' };

  describe('createOneOnOneSchema', () => {
    it('必須3項目で通る（メモ・コンディションは任意）', () => {
      const result = createOneOnOneSchema.safeParse(base);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(base);
    });

    it.each([
      ['employeeId', '対象従業員を選択してください'],
      ['interviewerId', '面談者を選択してください'],
    ])('%s が UUID でなければ選択を促すメッセージを返す', (field, message) => {
      const result = createOneOnOneSchema.safeParse({ ...base, [field]: 'not-uuid' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)[field]).toEqual({ code: 'invalid_format', message });
    });

    it('heldOn 未指定を弾く（実施日は必須）', () => {
      const { heldOn: _heldOn, ...withoutDate } = base;
      const result = createOneOnOneSchema.safeParse(withoutDate);

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['heldOn'].code).toBe('invalid_type');
    });

    it('heldOn の不正な日付形式を弾く', () => {
      const result = createOneOnOneSchema.safeParse({ ...base, heldOn: '2024/05/01' });

      expect(issuesByPath(result.error!)['heldOn']).toEqual({
        code: 'invalid_format',
        message: '日付は YYYY-MM-DD 形式で入力してください',
      });
    });

    it('notes は5000文字ちょうどまで、5001文字で弾かれる（境界値）', () => {
      expect(createOneOnOneSchema.safeParse({ ...base, notes: 'x'.repeat(5000) }).success).toBe(
        true,
      );

      const tooLong = createOneOnOneSchema.safeParse({ ...base, notes: 'x'.repeat(5001) });
      expect(issuesByPath(tooLong.error!)['notes']).toEqual({
        code: 'too_big',
        message: 'メモは5000文字以内で入力してください',
      });
    });

    it('notes の空文字を許容し、null は弾く', () => {
      expect(createOneOnOneSchema.safeParse({ ...base, notes: '' }).success).toBe(true);

      const nullNotes = createOneOnOneSchema.safeParse({ ...base, notes: null });
      expect(nullNotes.success).toBe(false);
      expect(issuesByPath(nullNotes.error!)['notes'].code).toBe('invalid_union');
    });

    it.each([1, 2, 3, 4, 5])('moodScore %i を受け付ける', (moodScore) => {
      const result = createOneOnOneSchema.safeParse({ ...base, moodScore });

      expect(result.success).toBe(true);
      expect(result.data?.moodScore).toBe(moodScore);
    });

    it('moodScore -1 を弾く（境界値・下側）', () => {
      const result = createOneOnOneSchema.safeParse({ ...base, moodScore: -1 });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['moodScore'].code).toBe('too_small');
    });

    it('moodScore 6 を専用メッセージで弾く（境界値・上側）', () => {
      const result = createOneOnOneSchema.safeParse({ ...base, moodScore: 6 });

      expect(issuesByPath(result.error!)['moodScore']).toEqual({
        code: 'too_big',
        message: 'コンディションは5以下で入力してください',
      });
    });

    it('moodScore 0 を「未評価」として受け付ける', () => {
      // UI のボタンは選択解除時に 0 を送る。スキーマは 0 をそのまま通し、
      // null への変換は Service が担う（DB の CHECK 制約は 1〜5）。
      // 責務をこう分けることで create / update が同じ契約になる。
      const result = createOneOnOneSchema.safeParse({ ...base, moodScore: 0 });

      expect(result.success).toBe(true);
      expect(result.data?.moodScore).toBe(0);
    });

    it('moodScore の小数を弾く（int 制約）', () => {
      const result = createOneOnOneSchema.safeParse({ ...base, moodScore: 2.5 });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['moodScore'].message).toBe(
        'コンディションは整数で入力してください',
      );
    });

    it('moodScore に文字列を渡すと弾かれる（create / update とも coerce しない）', () => {
      // update 側は z.coerce.number() なのに create 側は素の z.number()。
      // 同じフォーム部品から送っても作成と更新で結果が変わる非対称性がある。
      const result = createOneOnOneSchema.safeParse({ ...base, moodScore: '3' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['moodScore'].code).toBe('invalid_type');
    });

    it('moodScore 未指定は undefined のまま（既定値を入れない）', () => {
      const result = createOneOnOneSchema.safeParse(base);

      expect(result.data?.moodScore).toBeUndefined();
    });
  });

  describe('updateOneOnOneSchema', () => {
    const valid = { id: THIRD_UUID, ...base };

    it('必須項目が揃っていれば通る', () => {
      const result = updateOneOnOneSchema.safeParse(valid);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(valid);
    });

    it('id が UUID でなければ弾く', () => {
      const result = updateOneOnOneSchema.safeParse({ ...valid, id: '1on1-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });

    it('moodScore の文字列を弾く（create と同じ契約に統一）', () => {
      // 以前は update だけ z.coerce を持ち、同じフォーム部品なのに
      // 文字列 '3' の可否が create と update で食い違っていた。
      const result = updateOneOnOneSchema.safeParse({ ...valid, moodScore: '3' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['moodScore'].code).toBe('invalid_type');
    });

    it.each([1, 2, 3, 4, 5])('moodScore %i を受け付ける', (moodScore) => {
      const result = updateOneOnOneSchema.safeParse({ ...valid, moodScore });

      expect(result.data?.moodScore).toBe(moodScore);
    });

    it('数値 0 を「未評価」として受け付ける（create と同じ契約）', () => {
      // 以前は update だけが literal(0)→undefined の変換を持っており、
      // 同じフォーム部品なのに 0 の意味が create と食い違っていた。
      const result = updateOneOnOneSchema.safeParse({ ...valid, moodScore: 0 });

      expect(result.success).toBe(true);
      expect(result.data?.moodScore).toBe(0);
    });

    it('文字列 "0" は弾かれる（未評価を表すのは数値の 0 のみ）', () => {
      // create / update とも coerce しないため、
      // 第2枝の literal(0) は文字列 "0" と一致しないため、どちらも通らない。
      // フォームが文字列を送る限り「未選択」が保存できない不整合。
      const result = updateOneOnOneSchema.safeParse({ ...valid, moodScore: '0' });

      expect(result.success).toBe(false);
      expect(result.success).toBe(false);
    });

    it('moodScore 6 を弾く（境界値・上側）', () => {
      const result = updateOneOnOneSchema.safeParse({ ...valid, moodScore: 6 });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['moodScore'].code).toBe('too_big');
    });

    it('moodScore 未指定は undefined のまま通る', () => {
      const result = updateOneOnOneSchema.safeParse(valid);

      expect(result.success).toBe(true);
      expect(result.data?.moodScore).toBeUndefined();
    });

    it('moodScore の null / 空文字を弾く（未評価はキー省略か数値 0 で表す）', () => {
      for (const moodScore of [null, '']) {
        const result = updateOneOnOneSchema.safeParse({ ...valid, moodScore });

        expect(result.success).toBe(false);
        expect(result.success).toBe(false);
      }
    });

    it('notes の長さ制約は create と同一（5000文字超で弾く）', () => {
      const result = updateOneOnOneSchema.safeParse({ ...valid, notes: 'x'.repeat(5001) });

      expect(issuesByPath(result.error!)['notes'].message).toBe(
        'メモは5000文字以内で入力してください',
      );
    });

    it('heldOn の形式違反を弾く', () => {
      const result = updateOneOnOneSchema.safeParse({ ...valid, heldOn: '05-01-2024' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['heldOn'].message).toBe(
        '日付は YYYY-MM-DD 形式で入力してください',
      );
    });
  });

  describe('oneOnOneListQuerySchema', () => {
    it('空クエリに既定値が入る（heldOn の降順で最新から並ぶ）', () => {
      const result = oneOnOneListQuerySchema.safeParse({});

      expect(result.data).toEqual({ page: 1, perPage: 20, sort: 'heldOn', order: 'desc' });
    });

    it('文字列のページ番号を数値へ強制変換する', () => {
      const result = oneOnOneListQuerySchema.safeParse({ page: '2', perPage: '30' });

      expect(result.data).toMatchObject({ page: 2, perPage: 30 });
    });

    it('page 0 / perPage 101 を弾く（境界値）', () => {
      expect(
        issuesByPath(oneOnOneListQuerySchema.safeParse({ page: '0' }).error!)['page'].code,
      ).toBe('too_small');
      expect(
        issuesByPath(oneOnOneListQuerySchema.safeParse({ perPage: '101' }).error!)['perPage'].code,
      ).toBe('too_big');
      expect(oneOnOneListQuerySchema.safeParse({ perPage: '100' }).success).toBe(true);
    });

    it.each(['heldOn', 'createdAt'])('ソートキー %s を受け付ける', (sort) => {
      expect(oneOnOneListQuerySchema.safeParse({ sort }).success).toBe(true);
    });

    it('定義外のソートキーを弾く（任意カラムでの並び替えを許さない）', () => {
      const result = oneOnOneListQuerySchema.safeParse({ sort: 'moodScore' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['sort'].code).toBe('invalid_value');
    });

    it.each(['asc', 'desc'])('order %s を受け付ける', (order) => {
      expect(oneOnOneListQuerySchema.safeParse({ order }).success).toBe(true);
    });

    it('定義外の order を弾く', () => {
      const result = oneOnOneListQuerySchema.safeParse({ order: 'random' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['order'].code).toBe('invalid_value');
    });

    it('employeeId / interviewerId は UUID のみ受け付ける', () => {
      expect(
        oneOnOneListQuerySchema.safeParse({ employeeId: VALID_UUID, interviewerId: OTHER_UUID })
          .success,
      ).toBe(true);

      const invalid = oneOnOneListQuerySchema.safeParse({ employeeId: 'me' });
      expect(invalid.success).toBe(false);
      expect(issuesByPath(invalid.error!)['employeeId'].code).toBe('invalid_format');
    });

    it('search は任意（未指定なら undefined）', () => {
      expect(oneOnOneListQuerySchema.safeParse({}).data?.search).toBeUndefined();
      expect(oneOnOneListQuerySchema.safeParse({ search: '面談' }).data?.search).toBe('面談');
    });
  });
});
