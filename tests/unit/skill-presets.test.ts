import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SKILL_CATEGORY_PRESETS,
  SKILL_PRESETS,
  categoryForSkillName,
  mergeCategoryOptions,
  skillNameGroups,
} from '@/lib/constants/skill-presets';

describe('スキルの入力候補', () => {
  /**
   * デモデータと入力候補がズレると「デモを見て触ったら候補に出てこない」が起きる。
   * seed.sql は `supabase db reset` から単独で使える純 SQL のままにしたいので、
   * 生成物にはせず、ここで突き合わせてドリフトを止める。
   */
  it('supabase/seed.sql のデモデータと一致する', () => {
    const sql = readFileSync(resolve(import.meta.dirname, '../../supabase/seed.sql'), 'utf8');
    const block = sql.match(/insert into public\.skills[\s\S]*?\) as v\(name, category\);/);
    expect(block, 'seed.sql のスキル投入ブロックが見つからない').not.toBeNull();

    const rows = [...block![0].matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map((m) => ({
      name: m[1],
      category: m[2],
    }));

    expect(rows.length).toBe(SKILL_PRESETS.length);
    expect(new Set(rows.map((r) => r.name))).toEqual(new Set(SKILL_PRESETS.map((p) => p.name)));
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(SKILL_CATEGORY_PRESETS));

    // 名前とカテゴリの対応まで一致すること
    for (const row of rows) {
      expect(categoryForSkillName(row.name)).toBe(row.category);
    }
  });

  it('プリセットのカテゴリは全て定義済みのものに収まる', () => {
    for (const preset of SKILL_PRESETS) {
      expect(SKILL_CATEGORY_PRESETS).toContain(preset.category);
    }
  });

  it('スキル名が重複していない', () => {
    const names = SKILL_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('skillNameGroups', () => {
  it('カテゴリごとにまとめ、空のグループを作らない', () => {
    const groups = skillNameGroups();

    expect(groups.map((g) => g.value)).toEqual([...SKILL_CATEGORY_PRESETS]);
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it('全プリセットがどこかのグループに入る', () => {
    const flat = skillNameGroups().flatMap((g) => g.items);

    expect(new Set(flat)).toEqual(new Set(SKILL_PRESETS.map((p) => p.name)));
  });
});

describe('mergeCategoryOptions', () => {
  it('使用中のカテゴリを先に、残りのプリセットを後に出す', () => {
    const groups = mergeCategoryOptions(['フロントエンド', '社内システム']);

    expect(groups[0]).toEqual({
      value: 'この組織で使用中',
      items: ['フロントエンド', '社内システム'],
    });
    // 既に使われているものは「候補」側に重複させない
    expect(groups[1]!.items).not.toContain('フロントエンド');
    expect(groups[1]!.items).toContain('バックエンド');
  });

  it('1件も登録が無い組織でもプリセットだけは出す', () => {
    // getCategories() は既存 skills からの導出なので、最初の1件を作るまで空になる
    const groups = mergeCategoryOptions([]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ value: '候補', items: [...SKILL_CATEGORY_PRESETS] });
  });

  it('プリセットを全て使っている組織では「候補」を出さない', () => {
    const groups = mergeCategoryOptions([...SKILL_CATEGORY_PRESETS]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.value).toBe('この組織で使用中');
  });

  it('空文字のカテゴリは候補にしない', () => {
    // skills.category は nullable で、フォームは空文字を送ることがある
    const groups = mergeCategoryOptions(['', '  ', 'データ']);

    expect(groups[0]!.items).toEqual(['データ']);
  });
});

describe('categoryForSkillName', () => {
  it('プリセットの名前から既定のカテゴリを引ける', () => {
    expect(categoryForSkillName('Terraform')).toBe('インフラ');
  });

  it('プリセットに無い名前では null を返す（自由入力を尊重する）', () => {
    expect(categoryForSkillName('社内販売管理システム')).toBeNull();
  });
});
