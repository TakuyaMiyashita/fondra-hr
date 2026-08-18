import { z } from 'zod';

import { uuidField } from './common';

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .min(1, '部署名を入力してください')
    .max(100, '部署名は100文字以内で入力してください'),
  parentId: uuidField('親部署').optional().or(z.literal('')),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  id: uuidField('部署'),
  name: z
    .string()
    .min(1, '部署名を入力してください')
    .max(100, '部署名は100文字以内で入力してください')
    .optional(),
  parentId: uuidField('親部署').optional().or(z.literal('')),
});

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const moveDepartmentSchema = z.object({
  id: uuidField('部署'),
  newParentId: uuidField('親部署').nullable(),
});

export type MoveDepartmentInput = z.infer<typeof moveDepartmentSchema>;
