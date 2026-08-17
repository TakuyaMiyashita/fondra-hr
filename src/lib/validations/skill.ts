import { z } from 'zod';

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
  id: z.string().uuid(),
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
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  category: z.string().optional(),
});

export type SkillListQuery = z.infer<typeof skillListQuerySchema>;

export const assignSkillSchema = z.object({
  employeeId: z.string().uuid('無効な従業員IDです'),
  skillId: z.string().uuid('無効なスキルIDです'),
  level: z.coerce
    .number()
    .int()
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
  departmentId: z.string().uuid().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

export type SkillMatrixQuery = z.infer<typeof skillMatrixQuerySchema>;
