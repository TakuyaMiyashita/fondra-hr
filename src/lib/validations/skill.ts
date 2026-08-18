import { z } from 'zod';

import { pageField, perPageField, uuidField } from './common';

export const createSkillSchema = z.object({
  name: z
    .string()
    .min(1, 'スキル名を入力してください')
    .max(100, 'スキル名は100文字以内で入力してください'),
  category: z
    .string()
    .max(100, 'カテゴリは100文字以内で入力してください')
    .optional()
    .or(z.literal('')),
});

export type CreateSkillInput = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = z.object({
  id: uuidField('スキル'),
  name: z
    .string()
    .min(1, 'スキル名を入力してください')
    .max(100, 'スキル名は100文字以内で入力してください'),
  category: z
    .string()
    .max(100, 'カテゴリは100文字以内で入力してください')
    .optional()
    .or(z.literal('')),
});

export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;

export const skillListQuerySchema = z.object({
  page: pageField,
  perPage: perPageField(50),
  search: z.string().optional(),
  category: z.string().optional(),
});

export type SkillListQuery = z.infer<typeof skillListQuerySchema>;

export const assignSkillSchema = z.object({
  employeeId: uuidField('従業員'),
  skillId: uuidField('スキル'),
  level: z.coerce
    .number()
    .int('レベルは整数で入力してください')
    .min(1, 'レベルは1以上で入力してください')
    .max(5, 'レベルは5以下で入力してください'),
  certifiedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください')
    .optional()
    .or(z.literal('')),
});

export type AssignSkillInput = z.infer<typeof assignSkillSchema>;

export const skillMatrixQuerySchema = z.object({
  departmentId: uuidField('部署').optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

export type SkillMatrixQuery = z.infer<typeof skillMatrixQuerySchema>;
