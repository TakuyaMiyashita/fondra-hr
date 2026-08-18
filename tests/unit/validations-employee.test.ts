import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';

import {
  createDepartmentSchema,
  moveDepartmentSchema,
  updateDepartmentSchema,
} from '@/lib/validations/department';
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
} from '@/lib/validations/employee';

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

describe('employee validations', () => {
  describe('createEmployeeSchema', () => {
    it('必須項目（社員番号・氏名）だけで通り、status に既定値 active が入る', () => {
      const result = createEmployeeSchema.safeParse({
        employeeCode: 'E-001',
        fullName: '山田太郎',
      });

      expect(result.success).toBe(true);
      // .default('active') が実際に適用されることの確認。
      // 未指定でも DB の not null 制約を満たすことを保証している。
      expect(result.data).toEqual({
        employeeCode: 'E-001',
        fullName: '山田太郎',
        status: 'active',
      });
    });

    it('全項目を指定した場合も値がそのまま保持される', () => {
      const input = {
        employeeCode: 'E-002',
        fullName: '鈴木花子',
        fullNameKana: 'スズキハナコ',
        email: 'suzuki@example.com',
        departmentId: VALID_UUID,
        position: '課長',
        hiredOn: '2020-04-01',
        birthDate: '1990-12-31',
        status: 'inactive',
      };

      const result = createEmployeeSchema.safeParse(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    describe('employeeCode', () => {
      it('空文字を弾く（社員番号は一意キーなので空を許すと重複判定が壊れる）', () => {
        const result = createEmployeeSchema.safeParse({ employeeCode: '', fullName: '山田' });

        expect(result.success).toBe(false);
        expect(issuesByPath(result.error!)['employeeCode']).toEqual({
          code: 'too_small',
          message: '社員番号を入力してください',
        });
      });

      it('50文字ちょうどは通り、51文字は弾かれる（境界値）', () => {
        expect(
          createEmployeeSchema.safeParse({ employeeCode: 'E'.repeat(50), fullName: '山田' })
            .success,
        ).toBe(true);

        const tooLong = createEmployeeSchema.safeParse({
          employeeCode: 'E'.repeat(51),
          fullName: '山田',
        });
        expect(issuesByPath(tooLong.error!)['employeeCode']).toEqual({
          code: 'too_big',
          message: '社員番号は50文字以内で入力してください',
        });
      });

      it('未指定を弾く（必須項目であることを型レベルでも担保）', () => {
        const result = createEmployeeSchema.safeParse({ fullName: '山田' });

        expect(result.success).toBe(false);
        expect(issuesByPath(result.error!)['employeeCode'].code).toBe('invalid_type');
      });
    });

    describe('fullName', () => {
      it('空文字を弾く', () => {
        const result = createEmployeeSchema.safeParse({ employeeCode: 'E-1', fullName: '' });

        expect(issuesByPath(result.error!)['fullName']).toEqual({
          code: 'too_small',
          message: '氏名を入力してください',
        });
      });

      it('100文字ちょうどは通り、101文字は弾かれる（境界値）', () => {
        expect(
          createEmployeeSchema.safeParse({ employeeCode: 'E-1', fullName: 'あ'.repeat(100) })
            .success,
        ).toBe(true);

        const tooLong = createEmployeeSchema.safeParse({
          employeeCode: 'E-1',
          fullName: 'あ'.repeat(101),
        });
        expect(issuesByPath(tooLong.error!)['fullName']).toEqual({
          code: 'too_big',
          message: '氏名は100文字以内で入力してください',
        });
      });
    });

    describe('任意項目（optional + 空文字許容）の扱い', () => {
      const base = { employeeCode: 'E-1', fullName: '山田' };

      it.each([
        ['fullNameKana', 'カナ'],
        ['email', 'a@example.com'],
        ['departmentId', VALID_UUID],
        ['position', '部長'],
        ['hiredOn', '2024-01-01'],
        ['birthDate', '2000-01-01'],
      ])('%s は空文字を許容する（フォームの未入力欄がそのまま送られてくるため）', (key) => {
        const result = createEmployeeSchema.safeParse({ ...base, [key]: '' });

        expect(result.success).toBe(true);
        expect((result.data as Record<string, unknown>)[key]).toBe('');
      });

      it.each([
        ['fullNameKana', 'カナ'],
        ['email', 'a@example.com'],
        ['departmentId', VALID_UUID],
        ['position', '部長'],
        ['hiredOn', '2024-01-01'],
        ['birthDate', '2000-01-01'],
      ])('%s は未指定（undefined）でも通る', (key, value) => {
        expect(createEmployeeSchema.safeParse(base).success).toBe(true);
        expect(createEmployeeSchema.safeParse({ ...base, [key]: value }).success).toBe(true);
      });

      it('null は空文字と区別され、弾かれる（JSON の null を素通しさせない）', () => {
        const result = createEmployeeSchema.safeParse({ ...base, fullNameKana: null });

        expect(result.success).toBe(false);
        // optional().or(literal('')) は union のためカスタムメッセージが失われ、
        // 汎用の invalid_union になる。UI にはフィールド位置だけが伝わる。
        expect(issuesByPath(result.error!)['fullNameKana'].code).toBe('invalid_union');
      });

      it('fullNameKana は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
        expect(
          createEmployeeSchema.safeParse({ ...base, fullNameKana: 'ア'.repeat(100) }).success,
        ).toBe(true);

        const tooLong = createEmployeeSchema.safeParse({
          ...base,
          fullNameKana: 'ア'.repeat(101),
        });
        expect(issuesByPath(tooLong.error!)['fullNameKana']).toEqual({
          code: 'too_big',
          message: 'フリガナは100文字以内で入力してください',
        });
      });

      it('position は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
        expect(createEmployeeSchema.safeParse({ ...base, position: 'x'.repeat(100) }).success).toBe(
          true,
        );

        const tooLong = createEmployeeSchema.safeParse({ ...base, position: 'x'.repeat(101) });
        expect(issuesByPath(tooLong.error!)['position']).toEqual({
          code: 'too_big',
          message: '役職は100文字以内で入力してください',
        });
      });

      it('不正なメールを日本語メッセージで弾く', () => {
        const result = createEmployeeSchema.safeParse({ ...base, email: 'yamada@' });

        expect(issuesByPath(result.error!)['email']).toEqual({
          code: 'invalid_format',
          message: '有効なメールアドレスを入力してください',
        });
      });

      it('departmentId が UUID でなければ弾く（存在しない部署へのぶら下がりを防ぐ）', () => {
        const result = createEmployeeSchema.safeParse({ ...base, departmentId: 'dept-1' });

        expect(issuesByPath(result.error!)['departmentId']).toEqual({
          code: 'invalid_format',
          message: '無効な部署IDです',
        });
      });
    });

    describe('日付フォーマット', () => {
      const base = { employeeCode: 'E-1', fullName: '山田' };

      it.each([
        ['スラッシュ区切り', '2024/01/01'],
        ['ゼロ埋めなし', '2024-1-1'],
        ['日本語表記', '2024年1月1日'],
        ['時刻付き ISO8601', '2024-01-01T00:00:00Z'],
        ['桁あふれ', '20240-01-01'],
      ])('hiredOn の不正な形式を弾く: %s', (_label, hiredOn) => {
        const result = createEmployeeSchema.safeParse({ ...base, hiredOn });

        expect(result.success).toBe(false);
        expect(issuesByPath(result.error!)['hiredOn']).toEqual({
          code: 'invalid_format',
          message: '日付は YYYY-MM-DD 形式で入力してください',
        });
      });

      it('birthDate も同じ日付フォーマット検証を受ける', () => {
        const result = createEmployeeSchema.safeParse({ ...base, birthDate: '1990/01/01' });

        expect(issuesByPath(result.error!)['birthDate'].message).toBe(
          '日付は YYYY-MM-DD 形式で入力してください',
        );
      });

      it('形式が合っていれば実在しない日付も通ってしまう（正規表現のみで暦検証がない）', () => {
        // 仕様上の穴を明示的に固定しておく。DB 側の date 型で最終的に弾かれる想定。
        const result = createEmployeeSchema.safeParse({ ...base, hiredOn: '9999-99-99' });

        expect(result.success).toBe(true);
      });
    });

    describe('status', () => {
      it.each(['active', 'inactive', 'retired'])('有効な status %s を受け付ける', (status) => {
        const result = createEmployeeSchema.safeParse({
          employeeCode: 'E-1',
          fullName: '山田',
          status,
        });

        expect(result.success).toBe(true);
        expect(result.data?.status).toBe(status);
      });

      it.each([
        ['定義外の値', 'archived'],
        ['空文字', ''],
        ['大文字', 'ACTIVE'],
      ])('無効な status を弾く: %s', (_label, status) => {
        const result = createEmployeeSchema.safeParse({
          employeeCode: 'E-1',
          fullName: '山田',
          status,
        });

        expect(result.success).toBe(false);
        expect(issuesByPath(result.error!)['status'].code).toBe('invalid_value');
      });
    });
  });

  describe('updateEmployeeSchema', () => {
    it('id さえあれば部分更新として通る', () => {
      const result = updateEmployeeSchema.safeParse({ id: VALID_UUID, fullName: '新しい名前' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ id: VALID_UUID, fullName: '新しい名前' });
    });

    it('id が UUID でなければ弾く', () => {
      const result = updateEmployeeSchema.safeParse({ id: 'emp-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });

    it('id 未指定を弾く（更新対象が特定できないため）', () => {
      const result = updateEmployeeSchema.safeParse({ fullName: '山田' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_type');
    });

    it('status を省略したら status を出力しない（部分更新で在籍状態を書き換えない）', () => {
      // 回帰防止。baseFields の status は .default('active') を持つため、
      // 単に .optional() を後付けすると ZodOptional(ZodDefault) となり
      // default が優先され、入力に無くても 'active' が出力されてしまう。
      // updateEmployee は undefined のフィールドのみスキップする実装なので、
      // それが起きると氏名だけの更新で retired / inactive の従業員が在籍に戻る。
      const result = updateEmployeeSchema.safeParse({ id: VALID_UUID, fullName: '山田' });

      expect(result.success).toBe(true);
      expect((result.data as { status?: string }).status).toBeUndefined();
    });

    it('明示的に status を渡せばその値が保持される', () => {
      const result = updateEmployeeSchema.safeParse({ id: VALID_UUID, status: 'retired' });

      expect(result.data).toMatchObject({ status: 'retired' });
    });

    it('部分更新でも各フィールドの制約は維持される', () => {
      const result = updateEmployeeSchema.safeParse({
        id: VALID_UUID,
        employeeCode: 'E'.repeat(51),
        email: 'bad',
        hiredOn: '2024/01/01',
      });

      expect(result.success).toBe(false);
      const issues = issuesByPath(result.error!);
      expect(issues['employeeCode'].message).toBe('社員番号は50文字以内で入力してください');
      expect(issues['email'].message).toBe('有効なメールアドレスを入力してください');
      expect(issues['hiredOn'].message).toBe('日付は YYYY-MM-DD 形式で入力してください');
    });

    it('未知のキーは黙って捨てられる（Zod の既定挙動。DB へは渡らない）', () => {
      const result = updateEmployeeSchema.safeParse({ id: VALID_UUID, orgId: OTHER_UUID });

      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('orgId');
    });
  });

  describe('employeeListQuerySchema', () => {
    it('空のクエリに既定値が入る（初回アクセス時の一覧表示を成立させる）', () => {
      const result = employeeListQuerySchema.safeParse({});

      expect(result.data).toEqual({
        page: 1,
        perPage: 20,
        sort: 'createdAt',
        order: 'desc',
      });
    });

    it('URL クエリ由来の文字列を数値へ強制変換する（nuqs は文字列を渡してくる）', () => {
      const result = employeeListQuerySchema.safeParse({ page: '3', perPage: '50' });

      expect(result.data).toMatchObject({ page: 3, perPage: 50 });
    });

    it('page は1未満を弾く（0 や負値でのオフセット計算崩れを防ぐ）', () => {
      const zero = employeeListQuerySchema.safeParse({ page: '0' });
      expect(zero.success).toBe(false);
      expect(issuesByPath(zero.error!)['page'].code).toBe('too_small');

      expect(employeeListQuerySchema.safeParse({ page: '1' }).success).toBe(true);
    });

    it('perPage は1〜100（境界値：100 は通り 101 は弾く。全件取得攻撃の抑止）', () => {
      expect(employeeListQuerySchema.safeParse({ perPage: '100' }).success).toBe(true);

      const tooBig = employeeListQuerySchema.safeParse({ perPage: '101' });
      expect(tooBig.success).toBe(false);
      expect(issuesByPath(tooBig.error!)['perPage'].code).toBe('too_big');
    });

    it('数値に変換できない文字列は NaN として弾かれる', () => {
      const result = employeeListQuerySchema.safeParse({ page: 'abc' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].code).toBe('invalid_type');
    });

    it('小数を弾く（int 制約）', () => {
      const result = employeeListQuerySchema.safeParse({ page: '1.5' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['page'].message).toBe('ページ番号が不正です');
    });

    it.each([
      ['employeeCode'],
      ['fullName'],
      ['email'],
      ['position'],
      ['hiredOn'],
      ['status'],
      ['createdAt'],
    ])('ソートキー %s を受け付ける', (sort) => {
      expect(employeeListQuerySchema.safeParse({ sort }).success).toBe(true);
    });

    it('定義外のソートキーを弾く（SQL 組み立てへの任意カラム注入を防ぐ）', () => {
      const result = employeeListQuerySchema.safeParse({ sort: 'salary' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['sort'].code).toBe('invalid_value');
    });

    it.each(['asc', 'desc'])('order %s を受け付ける', (order) => {
      expect(employeeListQuerySchema.safeParse({ order }).success).toBe(true);
    });

    it('order の大文字表記を弾く（enum は厳密一致）', () => {
      const result = employeeListQuerySchema.safeParse({ order: 'ASC' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['order'].code).toBe('invalid_value');
    });

    it('status フィルタは任意だが、定義外の値は弾く', () => {
      expect(employeeListQuerySchema.safeParse({ status: 'retired' }).success).toBe(true);
      expect(employeeListQuerySchema.safeParse({}).data?.status).toBeUndefined();
      expect(employeeListQuerySchema.safeParse({ status: 'gone' }).success).toBe(false);
    });

    it('departmentId フィルタは UUID のみ受け付ける', () => {
      expect(employeeListQuerySchema.safeParse({ departmentId: VALID_UUID }).success).toBe(true);

      const invalid = employeeListQuerySchema.safeParse({ departmentId: '1' });
      expect(invalid.success).toBe(false);
      expect(issuesByPath(invalid.error!)['departmentId'].code).toBe('invalid_format');
    });

    it('search は任意の文字列を許容し、未指定なら undefined', () => {
      expect(employeeListQuerySchema.safeParse({ search: '山田' }).data?.search).toBe('山田');
      expect(employeeListQuerySchema.safeParse({}).data?.search).toBeUndefined();
    });

    it('search に null を渡すと弾かれる（optional と null は別物）', () => {
      const result = employeeListQuerySchema.safeParse({ search: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['search'].code).toBe('invalid_type');
    });
  });
});

describe('department validations', () => {
  describe('createDepartmentSchema', () => {
    it('部署名だけで通る（トップレベル部署の作成）', () => {
      const result = createDepartmentSchema.safeParse({ name: '人事部' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: '人事部' });
    });

    it('parentId に UUID を指定すれば子部署として通る', () => {
      const result = createDepartmentSchema.safeParse({ name: '採用課', parentId: VALID_UUID });

      expect(result.data).toEqual({ name: '採用課', parentId: VALID_UUID });
    });

    it('parentId の空文字を許容する（select 未選択時の値）', () => {
      const result = createDepartmentSchema.safeParse({ name: '採用課', parentId: '' });

      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBe('');
    });

    it('parentId が UUID でなければ専用メッセージで弾く', () => {
      const result = createDepartmentSchema.safeParse({ name: '採用課', parentId: 'root' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['parentId']).toEqual({
        code: 'invalid_format',
        message: '無効な親部署IDです',
      });
    });

    it('空文字の部署名を弾く', () => {
      const result = createDepartmentSchema.safeParse({ name: '' });

      expect(issuesByPath(result.error!)['name']).toEqual({
        code: 'too_small',
        message: '部署名を入力してください',
      });
    });

    it('部署名は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
      expect(createDepartmentSchema.safeParse({ name: 'あ'.repeat(100) }).success).toBe(true);

      const tooLong = createDepartmentSchema.safeParse({ name: 'あ'.repeat(101) });
      expect(issuesByPath(tooLong.error!)['name']).toEqual({
        code: 'too_big',
        message: '部署名は100文字以内で入力してください',
      });
    });

    it('部署名未指定を弾く', () => {
      const result = createDepartmentSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['name'].code).toBe('invalid_type');
    });
  });

  describe('updateDepartmentSchema', () => {
    it('id のみでも通る（名前を変えない親付け替えなどを許容する）', () => {
      const result = updateDepartmentSchema.safeParse({ id: VALID_UUID });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: VALID_UUID });
    });

    it('name を渡す場合は空文字を弾く（未指定と空文字を区別する）', () => {
      expect(updateDepartmentSchema.safeParse({ id: VALID_UUID, name: '営業部' }).success).toBe(
        true,
      );

      const empty = updateDepartmentSchema.safeParse({ id: VALID_UUID, name: '' });
      expect(empty.success).toBe(false);
      expect(issuesByPath(empty.error!)['name']).toEqual({
        code: 'too_small',
        message: '部署名を入力してください',
      });
    });

    it('name の101文字を弾く（境界値）', () => {
      const result = updateDepartmentSchema.safeParse({ id: VALID_UUID, name: 'x'.repeat(101) });

      expect(issuesByPath(result.error!)['name'].message).toBe(
        '部署名は100文字以内で入力してください',
      );
    });

    it('id が UUID でなければ弾く', () => {
      const result = updateDepartmentSchema.safeParse({ id: 'dept-1', name: '営業部' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });

    it('parentId は空文字も UUID も許容する', () => {
      expect(updateDepartmentSchema.safeParse({ id: VALID_UUID, parentId: '' }).success).toBe(true);
      expect(
        updateDepartmentSchema.safeParse({ id: VALID_UUID, parentId: OTHER_UUID }).success,
      ).toBe(true);
    });
  });

  describe('moveDepartmentSchema', () => {
    it('newParentId に UUID を指定して移動できる', () => {
      const result = moveDepartmentSchema.safeParse({ id: VALID_UUID, newParentId: OTHER_UUID });

      expect(result.data).toEqual({ id: VALID_UUID, newParentId: OTHER_UUID });
    });

    it('newParentId の null をルート直下への移動として受け付ける', () => {
      const result = moveDepartmentSchema.safeParse({ id: VALID_UUID, newParentId: null });

      expect(result.success).toBe(true);
      expect(result.data?.newParentId).toBeNull();
    });

    it('newParentId 未指定は弾く（nullable であって optional ではない＝意図の明示を強制）', () => {
      const result = moveDepartmentSchema.safeParse({ id: VALID_UUID });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['newParentId'].code).toBe('invalid_type');
    });

    it('newParentId の空文字を弾く（D&D の値取りこぼしを検出できる）', () => {
      const result = moveDepartmentSchema.safeParse({ id: VALID_UUID, newParentId: '' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['newParentId'].code).toBe('invalid_format');
    });

    it('id が UUID でなければ弾く', () => {
      const result = moveDepartmentSchema.safeParse({ id: 'x', newParentId: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['id'].code).toBe('invalid_format');
    });
  });
});
