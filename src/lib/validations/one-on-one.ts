import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください');

/**
 * コンディション。1〜5 が評価値で、0 は「未評価」を表すセンチネル。
 *
 * UI のボタンは選択解除時に 0 を送るため 0 も有効入力として受け付け、
 * 保存時に Service が null へ落とす（DB の CHECK 制約は 1〜5 のため）。
 *
 * create と update でこの1つの定義を共有する。以前は update だけが
 * z.coerce と min(1) + literal(0) を持っており、同じフォーム部品なのに
 * 文字列 '3' の可否や 0 の意味が create と update で食い違っていた。
 *
 * 変換（transform）や union は使わない。transform は出力型で
 * キーが必須化されて React Hook Form の resolver 型と衝突し、
 * union は Zod のエラーが invalid_union になって UI に出る文言が
 * 「Invalid input」に退化するため。
 */
const moodScore = z
  .number()
  .int('コンディションは整数で入力してください')
  .min(0, 'コンディションは0以上で入力してください')
  .max(5, 'コンディションは5以下で入力してください')
  .optional();

export const createOneOnOneSchema = z.object({
  employeeId: z.string().uuid('対象従業員を選択してください'),
  interviewerId: z.string().uuid('面談者を選択してください'),
  heldOn: dateString,
  notes: z.string().max(5000, 'メモは5000文字以内で入力してください').optional().or(z.literal('')),
  moodScore,
});

export type CreateOneOnOneInput = z.infer<typeof createOneOnOneSchema>;

export const updateOneOnOneSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid('対象従業員を選択してください'),
  interviewerId: z.string().uuid('面談者を選択してください'),
  heldOn: dateString,
  notes: z.string().max(5000, 'メモは5000文字以内で入力してください').optional().or(z.literal('')),
  moodScore,
});

export type UpdateOneOnOneInput = z.infer<typeof updateOneOnOneSchema>;

export const oneOnOneListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  employeeId: z.string().uuid().optional(),
  interviewerId: z.string().uuid().optional(),
  sort: z.enum(['heldOn', 'createdAt']).default('heldOn'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type OneOnOneListQuery = z.infer<typeof oneOnOneListQuerySchema>;
