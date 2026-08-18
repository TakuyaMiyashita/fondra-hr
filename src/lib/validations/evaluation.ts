import { z } from 'zod';

import { uuidField } from './common';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください');

export const cycleStatus = z.enum(['draft', 'in_progress', 'completed'], {
  message: '無効なステータスです',
});
export type CycleStatus = z.infer<typeof cycleStatus>;

export const evaluationStatus = z.enum(
  ['draft', 'in_progress', 'submitted', 'confirmed', 'returned'],
  { message: '無効なステータスです' },
);
export type EvaluationStatus = z.infer<typeof evaluationStatus>;

/**
 * 期間の前後関係チェック。
 *
 * 形式が正しくても開始日 > 終了日 の期間は業務上ありえない。
 * 一覧は periodStart の降順で並ぶため、逆転したサイクルが混ざると
 * 並び順まで壊れる。日付は YYYY-MM-DD 固定なので辞書順比較で足りる。
 */
const periodIsOrdered = (v: { periodStart: string; periodEnd: string }) =>
  v.periodStart <= v.periodEnd;

const periodOrderIssue = {
  message: '終了日は開始日以降の日付を指定してください',
  path: ['periodEnd'] as PropertyKey[],
};

export const createCycleSchema = z
  .object({
    name: z
      .string()
      .min(1, '評価サイクル名を入力してください')
      .max(100, '評価サイクル名は100文字以内で入力してください'),
    periodStart: dateString,
    periodEnd: dateString,
  })
  .refine(periodIsOrdered, periodOrderIssue);

export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const updateCycleSchema = z
  .object({
    id: uuidField('評価サイクル'),
    name: z
      .string()
      .min(1, '評価サイクル名を入力してください')
      .max(100, '評価サイクル名は100文字以内で入力してください'),
    periodStart: dateString,
    periodEnd: dateString,
    status: cycleStatus,
  })
  .refine(periodIsOrdered, periodOrderIssue);

export type UpdateCycleInput = z.infer<typeof updateCycleSchema>;

export const createEvaluationSchema = z.object({
  cycleId: z.string().uuid('評価サイクルを選択してください'),
  employeeId: z.string().uuid('対象従業員を選択してください'),
  evaluatorId: z.string().uuid('評価者を選択してください'),
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

export const updateEvaluationSchema = z.object({
  id: uuidField('評価'),
  // 評価点は 1〜5 の離散値。.int() が無いと 3.5 のような小数が通り、
  // 平均や分布の集計・表示が前提と食い違う。
  ratings: z
    .record(
      z.string(),
      z
        .number()
        .int('評価点は整数で入力してください')
        .min(1, '評価点は1以上で入力してください')
        .max(5, '評価点は5以下で入力してください'),
    )
    .optional(),
  comment: z
    .string()
    .max(5000, 'コメントは5000文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  status: evaluationStatus.optional(),
});

export type UpdateEvaluationInput = z.infer<typeof updateEvaluationSchema>;
