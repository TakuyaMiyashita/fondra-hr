import { describe, expect, it } from 'vitest';

import { isUniqueViolation } from '@/services/db-errors';

/**
 * 実際のエラー形は postgres.js が投げるものを実機で確認した。
 * `code` は '23505'、制約名は `constraint_name`（camelCase ではない）。
 * ここを取り違えると、競合時に握り潰しが効かず 500 になる。
 */
const realUniqueViolation = Object.assign(new Error('duplicate key value'), {
  name: 'PostgresError',
  severity: 'ERROR',
  code: '23505',
  detail: 'Key (org_id, employee_code)=(...) already exists.',
  schema_name: 'public',
  table_name: 'employees',
  constraint_name: 'employees_org_id_employee_code_key',
});

describe('isUniqueViolation', () => {
  it('一意制約違反を検出する', () => {
    expect(isUniqueViolation(realUniqueViolation)).toBe(true);
  });

  it('制約名を指定すると、その制約のときだけ true を返す', () => {
    // 1つのテーブルに一意制約が増えたとき、無関係な違反まで
    // 同じメッセージで握り潰さないための絞り込み。
    expect(isUniqueViolation(realUniqueViolation, 'employees_org_id_employee_code_key')).toBe(true);
    expect(isUniqueViolation(realUniqueViolation, 'evaluations_unique_per_pair')).toBe(false);
  });

  it.each([
    ['外部キー違反', { code: '23503' }],
    ['NOT NULL 違反', { code: '23502' }],
    ['CHECK 違反', { code: '23514' }],
  ])('%s は一意制約違反として扱わない', (_label, e) => {
    expect(isUniqueViolation(e)).toBe(false);
  });

  it.each([
    ['ただの Error', new Error('boom')],
    ['null', null],
    ['undefined', undefined],
    ['文字列', 'error'],
    ['数値', 23505],
    ['code を持たないオブジェクト', {}],
  ])('%s は false', (_label, e) => {
    expect(isUniqueViolation(e)).toBe(false);
  });

  it('code が数値の 23505 でも文字列と混同しない', () => {
    // Postgres のエラーコードは文字列。数値で来ることは無いが、
    // 緩い比較にすると別のエラーを取り違えうる。
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });
});
