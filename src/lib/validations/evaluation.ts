import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください');

export const cycleStatus = z.enum(['draft', 'in_progress', 'completed']);
export type CycleStatus = z.infer<typeof cycleStatus>;

export const evaluationStatus = z.enum([
  'draft',
  'in_progress',
  'submitted',
  'confirmed',
  'returned',
]);
export type EvaluationStatus = z.infer<typeof evaluationStatus>;

export const createCycleSchema = z.object({
  name: z
    .string()
    .min(1, '評価サイクル名を入力してください')
    .max(100, '評価サイクル名は100文字以内で入力してください'),
  periodStart: dateString,
  periodEnd: dateString,
});

export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const updateCycleSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, '評価サイクル名を入力してください')
    .max(100, '評価サイクル名は100文字以内で入力してください'),
  periodStart: dateString,
  periodEnd: dateString,
  status: cycleStatus,
});

export type UpdateCycleInput = z.infer<typeof updateCycleSchema>;

export const createEvaluationSchema = z.object({
  cycleId: z.string().uuid('評価サイクルを選択してください'),
  employeeId: z.string().uuid('対象従業員を選択してください'),
  evaluatorId: z.string().uuid('評価者を選択してください'),
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

export const updateEvaluationSchema = z.object({
  id: z.string().uuid(),
  ratings: z.record(z.string(), z.number().min(1).max(5)).optional(),
  comment: z
    .string()
    .max(5000, 'コメントは5000文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  status: evaluationStatus.optional(),
});

export type UpdateEvaluationInput = z.infer<typeof updateEvaluationSchema>;
