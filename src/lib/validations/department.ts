import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .min(1, '部署名を入力してください')
    .max(100, '部署名は100文字以内で入力してください'),
  parentId: z.string().uuid('無効な親部署IDです').optional().or(z.literal('')),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, '部署名を入力してください')
    .max(100, '部署名は100文字以内で入力してください')
    .optional(),
  parentId: z.string().uuid('無効な親部署IDです').optional().or(z.literal('')),
});

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const moveDepartmentSchema = z.object({
  id: z.string().uuid(),
  newParentId: z.string().uuid().nullable(),
});

export type MoveDepartmentInput = z.infer<typeof moveDepartmentSchema>;
