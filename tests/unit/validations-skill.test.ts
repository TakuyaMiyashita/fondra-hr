import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';

import { auditLogListQuerySchema } from '@/lib/validations/audit-log';
import {
  assignSkillSchema,
  createSkillSchema,
  skillListQuerySchema,
  skillMatrixQuerySchema,
  updateSkillSchema,
} from '@/lib/validations/skill';

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

describe('skill validations', () => {
  describe('createSkillSchema', () => {
    it('スキル名だけで通る（カテゴリは任意）', () => {
      const result = createSkillSchema.safeParse({ name: 'TypeScript' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'TypeScript' });
    });

    it('カテゴリ付きで通る', () => {
      const result = createSkillSchema.safeParse({ name: 'TypeScript', category: '言語' });

      expect(result.data).toEqual({ name: 'TypeScript', category: '言語' });
    });

    it('カテゴリの空文字を許容する（未選択の select がそのまま送られてくる）', () => {
      const result = createSkillSchema.safeParse({ name: 'TypeScript', category: '' });

      expect(result.success).toBe(true);
      expect(result.data?.category).toBe('');
    });

    it('スキル名の空文字を弾く（名無しスキルがマスタに混ざるのを防ぐ）', () => {
      const result = createSkillSchema.safeParse({ name: '' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['name']).toEqual({
        code: 'too_small',
        message: 'スキル名を入力してください',
      });
    });

    it('スキル名未指定を弾く', () => {
      const result = createSkillSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['name'].code).toBe('invalid_type');
    });

    it('スキル名は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
      expect(createSkillSchema.safeParse({ name: 'x'.repeat(100) }).success).toBe(true);

      const tooLong = createSkillSchema.safeParse({ name: 'x'.repeat(101) });
      expect(issuesByPath(tooLong.error!)['name']).toEqual({
        code: 'too_big',
        message: 'スキル名は100文字以内で入力してください',
      });
    });

    it('カテゴリは100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
      expect(createSkillSchema.safeParse({ name: 'A', category: 'x'.repeat(100) }).success).toBe(
        true,
      );

      const tooLong = createSkillSchema.safeParse({ name: 'A', category: 'x'.repeat(101) });
      expect(issuesByPath(tooLong.error!)['category']).toEqual({
        code: 'too_big',
        message: 'カテゴリは100文字以内で入力してください',
      });
    });

    it('カテゴリの null は空文字と区別して弾く', () => {
      const result = createSkillSchema.safeParse({ name: 'A', category: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['category'].code).toBe('invalid_union');
    });
  });

  describe('updateSkillSchema', () => {
    it('id と name が揃っていれば通る', () => {
      const result = updateSkillSchema.safeParse({ id: VALID_UUID, name: 'Go' });

      expect(result.data).toEqual({ id: VALID_UUID, name: 'Go' });
    });

    it('name は更新時も必須（create と違い省略できない）', () => {
      const result = updateSkillSchema.safeParse({ id: VALID_UUID });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['name'].code).toBe('invalid_type');
    });

    it('id が UUID でなければ弾く', () => {
      const result = updateSkillSchema.safeParse({ id: 'skill-1', name: 'Go' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });

    it('name / category の長さ制約は create と同一', () => {
      const result = updateSkillSchema.safeParse({
        id: VALID_UUID,
        name: 'x'.repeat(101),
        category: 'y'.repeat(101),
      });

      expect(result.success).toBe(false);
      const issues = issuesByPath(result.error!);
      expect(issues['name'].message).toBe('スキル名は100文字以内で入力してください');
      expect(issues['category'].message).toBe('カテゴリは100文字以内で入力してください');
    });
  });

  describe('skillListQuerySchema', () => {
    it('空クエリに既定値が入る（perPage の既定は50でスキル一覧向けに多め）', () => {
      const result = skillListQuerySchema.safeParse({});

      expect(result.data).toEqual({ page: 1, perPage: 50 });
    });

    it('URL 由来の文字列を数値へ強制変換する', () => {
      const result = skillListQuerySchema.safeParse({ page: '2', perPage: '10' });

      expect(result.data).toMatchObject({ page: 2, perPage: 10 });
    });

    it('page 0 を弾き、1 は通す（境界値）', () => {
      expect(skillListQuerySchema.safeParse({ page: '1' }).success).toBe(true);

      const zero = skillListQuerySchema.safeParse({ page: '0' });
      expect(zero.success).toBe(false);
      expect(issuesByPath(zero.error!)['page'].code).toBe('too_small');
    });

    it('perPage は100までで、101 は弾く（境界値）', () => {
      expect(skillListQuerySchema.safeParse({ perPage: '100' }).success).toBe(true);

      const tooBig = skillListQuerySchema.safeParse({ perPage: '101' });
      expect(tooBig.success).toBe(false);
      expect(issuesByPath(tooBig.error!)['perPage'].code).toBe('too_big');
    });

    it('空文字の page は coerce で 0 になり too_small で弾かれる（?page= の空指定対策）', () => {
      const result = skillListQuerySchema.safeParse({ page: '' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].code).toBe('too_small');
    });

    it('search / category は任意で、未指定なら undefined', () => {
      const result = skillListQuerySchema.safeParse({});

      expect(result.data?.search).toBeUndefined();
      expect(result.data?.category).toBeUndefined();
    });

    it('search / category に文字列を渡せばそのまま保持される', () => {
      const result = skillListQuerySchema.safeParse({ search: 'Type', category: '言語' });

      expect(result.data).toMatchObject({ search: 'Type', category: '言語' });
    });
  });

  describe('assignSkillSchema', () => {
    const base = { employeeId: VALID_UUID, skillId: OTHER_UUID };

    it('従業員・スキル・レベルが揃えば通る', () => {
      const result = assignSkillSchema.safeParse({ ...base, level: 3 });

      expect(result.data).toEqual({ ...base, level: 3 });
    });

    it('レベルの文字列を数値へ強制変換する（フォームの select は文字列を返す）', () => {
      const result = assignSkillSchema.safeParse({ ...base, level: '4' });

      expect(result.success).toBe(true);
      expect(result.data?.level).toBe(4);
      expect(typeof result.data?.level).toBe('number');
    });

    it.each([1, 2, 3, 4, 5])('レベル %i を受け付ける（有効域すべて）', (level) => {
      expect(assignSkillSchema.safeParse({ ...base, level }).success).toBe(true);
    });

    it('レベル0を専用メッセージで弾く（境界値・下側）', () => {
      const result = assignSkillSchema.safeParse({ ...base, level: 0 });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['level']).toEqual({
        code: 'too_small',
        message: 'レベルは1以上で入力してください',
      });
    });

    it('レベル6を専用メッセージで弾く（境界値・上側）', () => {
      const result = assignSkillSchema.safeParse({ ...base, level: 6 });

      expect(issuesByPath(result.error!)['level']).toEqual({
        code: 'too_big',
        message: 'レベルは5以下で入力してください',
      });
    });

    it('小数のレベルを弾く（int 制約。3.5 のような集計不能値を防ぐ）', () => {
      const result = assignSkillSchema.safeParse({ ...base, level: 3.5 });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['level'].message).toBe('レベルは整数で入力してください');
    });

    it('数値化できない文字列を弾く', () => {
      const result = assignSkillSchema.safeParse({ ...base, level: 'high' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['level'].code).toBe('invalid_type');
    });

    it('レベル未指定は NaN 扱いで弾かれる（coerce のため「必須」メッセージにはならない）', () => {
      // z.coerce.number() は undefined を Number(undefined)=NaN に変換するため、
      // ユーザーには「レベルは1以上で入力してください」ではなく
      // Zod 既定の英語メッセージが表示される。UI 上の既知の穴として固定しておく。
      const result = assignSkillSchema.safeParse(base);

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['level'].code).toBe('invalid_type');
      expect(issuesByPath(result.error!)['level'].message).toContain('NaN');
    });

    it('employeeId / skillId が UUID でなければ専用メッセージで弾く', () => {
      const result = assignSkillSchema.safeParse({ employeeId: 'e1', skillId: 's1', level: 3 });

      expect(result.success).toBe(false);
      const issues = issuesByPath(result.error!);
      expect(issues['employeeId']).toEqual({
        code: 'invalid_format',
        message: '無効な従業員IDです',
      });
      expect(issues['skillId']).toEqual({ code: 'invalid_format', message: '無効なスキルIDです' });
    });

    it('certifiedAt は任意で、空文字も許容する', () => {
      expect(assignSkillSchema.safeParse({ ...base, level: 3 }).data?.certifiedAt).toBeUndefined();
      expect(assignSkillSchema.safeParse({ ...base, level: 3, certifiedAt: '' }).success).toBe(
        true,
      );
      expect(
        assignSkillSchema.safeParse({ ...base, level: 3, certifiedAt: '2024-06-30' }).success,
      ).toBe(true);
    });

    it.each([
      ['スラッシュ区切り', '2024/06/30'],
      ['ゼロ埋めなし', '2024-6-30'],
      ['時刻付き', '2024-06-30T12:00:00Z'],
    ])('certifiedAt の不正な日付形式を弾く: %s', (_label, certifiedAt) => {
      const result = assignSkillSchema.safeParse({ ...base, level: 3, certifiedAt });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['certifiedAt']).toEqual({
        code: 'invalid_format',
        message: '日付は YYYY-MM-DD 形式で入力してください',
      });
    });
  });

  describe('skillMatrixQuerySchema', () => {
    it('全項目任意なので空オブジェクトで通る（既定値は入らない）', () => {
      const result = skillMatrixQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('departmentId / category / search を指定できる', () => {
      const input = { departmentId: VALID_UUID, category: '言語', search: '山田' };
      const result = skillMatrixQuerySchema.safeParse(input);

      expect(result.data).toEqual(input);
    });

    it('departmentId が UUID でなければ弾く（部署絞り込みの不正値を防ぐ）', () => {
      const result = skillMatrixQuerySchema.safeParse({ departmentId: 'dept-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['departmentId'].code).toBe('invalid_format');
    });

    it('departmentId の空文字を弾く（未選択時は空文字ではなく省略する必要がある）', () => {
      const result = skillMatrixQuerySchema.safeParse({ departmentId: '' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['departmentId'].code).toBe('invalid_format');
    });
  });
});

describe('audit log validations', () => {
  describe('auditLogListQuerySchema', () => {
    it('空クエリに既定値が入る（page=1 / perPage=20 / order=desc）', () => {
      const result = auditLogListQuerySchema.safeParse({});

      expect(result.data).toEqual({ page: 1, perPage: 20, order: 'desc' });
    });

    it('URL 由来の文字列を数値へ強制変換する', () => {
      const result = auditLogListQuerySchema.safeParse({ page: '3', perPage: '100' });

      expect(result.data).toMatchObject({ page: 3, perPage: 100 });
    });

    it('page は1未満を弾く（境界値：1 は通り 0 は弾く）', () => {
      expect(auditLogListQuerySchema.safeParse({ page: 1 }).success).toBe(true);

      const zero = auditLogListQuerySchema.safeParse({ page: 0 });
      expect(zero.success).toBe(false);
      expect(issuesByPath(zero.error!)['page'].code).toBe('too_small');
    });

    it('負の page を弾く', () => {
      const result = auditLogListQuerySchema.safeParse({ page: '-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].code).toBe('too_small');
    });

    it('perPage は1〜100（101 を弾く。監査ログ全件吸い出しの抑止）', () => {
      expect(auditLogListQuerySchema.safeParse({ perPage: 1 }).success).toBe(true);
      expect(auditLogListQuerySchema.safeParse({ perPage: 100 }).success).toBe(true);

      const tooBig = auditLogListQuerySchema.safeParse({ perPage: 101 });
      expect(tooBig.success).toBe(false);
      expect(issuesByPath(tooBig.error!)['perPage'].code).toBe('too_big');

      const tooSmall = auditLogListQuerySchema.safeParse({ perPage: 0 });
      expect(issuesByPath(tooSmall.error!)['perPage'].code).toBe('too_small');
    });

    it('小数の page を弾く（int 制約）', () => {
      const result = auditLogListQuerySchema.safeParse({ page: '1.5' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].message).toBe('ページ番号が不正です');
    });

    it('数値化できない文字列を NaN として弾く', () => {
      const result = auditLogListQuerySchema.safeParse({ page: 'abc' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].message).toContain('NaN');
    });

    it('null の page は coerce で 0 になり too_small で弾かれる', () => {
      // Number(null) === 0 という JS の仕様が coerce 経由で表面化する。
      // 「null なら既定値」ではないことを明示的に固定する。
      const result = auditLogListQuerySchema.safeParse({ page: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].code).toBe('too_small');
    });

    it('明示的な undefined では既定値が適用される', () => {
      const result = auditLogListQuerySchema.safeParse({ page: undefined, perPage: undefined });

      expect(result.data).toMatchObject({ page: 1, perPage: 20 });
    });

    it.each(['asc', 'desc'])('order %s を受け付ける', (order) => {
      const result = auditLogListQuerySchema.safeParse({ order });

      expect(result.success).toBe(true);
      expect(result.data?.order).toBe(order);
    });

    it('定義外の order を弾く（大文字も不可）', () => {
      const result = auditLogListQuerySchema.safeParse({ order: 'ASC' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['order'].code).toBe('invalid_value');
    });

    it('resourceType / action は任意の文字列（絞り込みは Service 層側の責務）', () => {
      const result = auditLogListQuerySchema.safeParse({
        resourceType: 'employee',
        action: 'employee.update',
      });

      expect(result.data).toMatchObject({ resourceType: 'employee', action: 'employee.update' });
    });

    it('resourceType に null を渡すと弾かれる（optional は null を含まない）', () => {
      const result = auditLogListQuerySchema.safeParse({ resourceType: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['resourceType'].code).toBe('invalid_type');
    });
  });
});
