import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  orderField,
  pageField,
  perPageField,
  sortField,
  uuidField,
} from '@/lib/validations/common';

/**
 * ドメイン横断の検証部品。
 *
 * Zod スキーマは宣言的で、import しただけでカバレッジ上は 100% になる。
 * 数値は「ルールが効いているか」を何も保証しないため、境界値と不正形式を
 * 明示的に通す。
 *
 * ここで検証している文言は実質的な仕様でもある。これらのメッセージは
 * Server Action の `err()` に載って toast にそのまま出るため、Zod 既定の
 * 英語（`Invalid uuid` / `Too big: expected number to be <=100`）が
 * 混じると日本語 UI に内部エラーが露出する。
 */

const VALID_UUID = '3f9d2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5f';

describe('uuidField', () => {
  it('有効な UUID を通す', () => {
    expect(uuidField('従業員').safeParse(VALID_UUID)).toMatchObject({
      success: true,
      data: VALID_UUID,
    });
  });

  it('ラベルを差し込んだ日本語メッセージを返す', () => {
    const result = uuidField('部署').safeParse('not-a-uuid');

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('無効な部署IDです');
  });

  it('空文字を弾く', () => {
    // 未選択のセレクトから '' が飛んでくる経路が実在する。
    expect(uuidField('従業員').safeParse('').success).toBe(false);
  });

  it('UUID に似た文字列（桁不足・記号違い）を弾く', () => {
    expect(uuidField('従業員').safeParse('3f9d2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5').success).toBe(
      false,
    );
    expect(uuidField('従業員').safeParse('3f9d2c1a5b6e4c7d8e9f0a1b2c3d4e5f').success).toBe(false);
  });

  it('数値など文字列以外を弾く', () => {
    expect(uuidField('従業員').safeParse(42).success).toBe(false);
  });
});

describe('pageField', () => {
  it('未指定なら 1 を既定値にする', () => {
    expect(z.object({ page: pageField }).parse({})).toEqual({ page: 1 });
  });

  it('文字列の数値を受け付ける（URL クエリ由来のため）', () => {
    expect(pageField.parse('3')).toBe(3);
  });

  it('下限 1 は通し、0 は弾く', () => {
    expect(pageField.safeParse(1).success).toBe(true);

    const result = pageField.safeParse(0);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('ページ番号が不正です');
  });

  it('小数を弾く', () => {
    // offset 計算に小数が入ると LIMIT/OFFSET が壊れる。
    const result = pageField.safeParse('1.5');

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('ページ番号が不正です');
  });
});

describe('perPageField', () => {
  it('呼び出し側が指定した既定値を使う', () => {
    expect(z.object({ perPage: perPageField(50) }).parse({})).toEqual({ perPage: 50 });
    expect(z.object({ perPage: perPageField(20) }).parse({})).toEqual({ perPage: 20 });
  });

  it('上限 100 は通し、101 は日本語で弾く', () => {
    // URL を書き換えれば誰でも perPage=10000 を送れる。
    expect(perPageField(20).safeParse(100).success).toBe(true);

    const result = perPageField(20).safeParse(101);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('表示件数は100以下で指定してください');
  });

  it('下限 1 は通し、0 は日本語で弾く', () => {
    expect(perPageField(20).safeParse(1).success).toBe(true);

    const result = perPageField(20).safeParse(0);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('表示件数は1以上で指定してください');
  });

  it('小数を弾く', () => {
    const result = perPageField(20).safeParse('20.5');

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('表示件数が不正です');
  });
});

describe('orderField', () => {
  it('未指定なら desc', () => {
    expect(z.object({ order: orderField }).parse({})).toEqual({ order: 'desc' });
  });

  it.each(['asc', 'desc'])('%s を通す', (value) => {
    expect(orderField.parse(value)).toBe(value);
  });

  it('列挙外の値を日本語で弾く', () => {
    // ORDER BY に文字列を組み立てて渡す経路があるため、列挙外は必ず止める。
    const result = orderField.safeParse('drop table');

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('並び順が不正です');
  });
});

describe('sortField', () => {
  const sort = sortField(['heldOn', 'createdAt'], 'heldOn');

  it('未指定なら呼び出し側の既定値', () => {
    expect(z.object({ sort }).parse({})).toEqual({ sort: 'heldOn' });
  });

  it('許可された値を通す', () => {
    expect(sort.parse('createdAt')).toBe('createdAt');
  });

  it('列挙外の値を日本語で弾く', () => {
    // 値はカラム名の解決に使われる。列挙外が通ると undefined のカラムを
    // 参照して 500 になる。
    const result = sort.safeParse('salary');

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('並び替え項目が不正です');
  });
});
