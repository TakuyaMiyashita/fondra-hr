/**
 * スキル名とカテゴリの入力候補。
 *
 * **マスタではなく候補。** 選択を強制せず、自由入力も受け付ける。
 * 企業固有のスキル（社内システム名、独自の職能）を登録できなくなるため。
 *
 * DB のテーブルにしない理由は
 * [ADR 0008](../../../docs/adr/0008-skill-presets-live-in-code-not-in-db.md)。
 *
 * `supabase/seed.sql` のデモデータと同じ内容を保つ。ズレると
 * 「デモを見て触ったら候補に出てこない」が起きるため、
 * `tests/unit/skill-presets.test.ts` が両者を突き合わせている。
 */

export const SKILL_CATEGORY_PRESETS = [
  'フロントエンド',
  'バックエンド',
  'インフラ',
  'データ',
  'デザイン',
  'ビジネス',
] as const;

export type SkillCategoryPreset = (typeof SKILL_CATEGORY_PRESETS)[number];

export interface SkillPreset {
  readonly name: string;
  readonly category: SkillCategoryPreset;
}

export const SKILL_PRESETS: readonly SkillPreset[] = [
  { name: 'React', category: 'フロントエンド' },
  { name: 'TypeScript', category: 'フロントエンド' },
  { name: 'Next.js', category: 'フロントエンド' },
  { name: 'CSS / Tailwind', category: 'フロントエンド' },
  { name: 'Node.js', category: 'バックエンド' },
  { name: 'Go', category: 'バックエンド' },
  { name: 'Python', category: 'バックエンド' },
  { name: 'PostgreSQL', category: 'バックエンド' },
  { name: 'API設計', category: 'バックエンド' },
  { name: 'AWS', category: 'インフラ' },
  { name: 'Docker / Kubernetes', category: 'インフラ' },
  { name: 'Terraform', category: 'インフラ' },
  { name: 'CI/CD', category: 'インフラ' },
  { name: 'SQL分析', category: 'データ' },
  { name: 'データ基盤構築', category: 'データ' },
  { name: '機械学習', category: 'データ' },
  { name: 'UIデザイン', category: 'デザイン' },
  { name: 'UXリサーチ', category: 'デザイン' },
  { name: '提案営業', category: 'ビジネス' },
  { name: '折衝・交渉', category: 'ビジネス' },
  { name: '採用面接', category: 'ビジネス' },
  { name: 'プロジェクト管理', category: 'ビジネス' },
];

/** 入力候補のグループ。`value` が見出し、`items` が候補。 */
export interface SuggestionGroup {
  readonly value: string;
  readonly items: readonly string[];
}

/** スキル名の候補をカテゴリごとにまとめる。 */
export function skillNameGroups(): SuggestionGroup[] {
  return SKILL_CATEGORY_PRESETS.map((category) => ({
    value: category,
    items: SKILL_PRESETS.filter((p) => p.category === category).map((p) => p.name),
  })).filter((g) => g.items.length > 0);
}

/**
 * カテゴリの候補。組織で実際に使われているものを先に出す。
 *
 * 使用中のカテゴリは `getCategories()` が既存の skills から導出するため、
 * **1件も登録されていない組織では空になる**。プリセットを併せて出すことで、
 * 最初の1件を作るときにも選択肢がある状態にする。
 */
export function mergeCategoryOptions(orgCategories: readonly string[]): SuggestionGroup[] {
  const inUse = orgCategories.filter((c) => c.trim() !== '');
  const seen = new Set(inUse);
  const rest = SKILL_CATEGORY_PRESETS.filter((c) => !seen.has(c));

  const groups: SuggestionGroup[] = [];
  if (inUse.length > 0) {
    groups.push({ value: 'この組織で使用中', items: inUse });
  }
  if (rest.length > 0) {
    groups.push({ value: '候補', items: rest });
  }
  return groups;
}

/** プリセットのスキル名から、既定のカテゴリを引く。無ければ null。 */
export function categoryForSkillName(name: string): string | null {
  return SKILL_PRESETS.find((p) => p.name === name)?.category ?? null;
}
