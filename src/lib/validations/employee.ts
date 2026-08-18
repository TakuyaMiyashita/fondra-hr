import { z } from 'zod';

import { orderField, pageField, perPageField, sortField, uuidField } from './common';

const employeeStatus = z.enum(['active', 'inactive', 'retired'], {
  message: '無効な在籍状態です',
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください');

const baseFields = {
  employeeCode: z
    .string()
    .min(1, '社員番号を入力してください')
    .max(50, '社員番号は50文字以内で入力してください'),
  fullName: z
    .string()
    .min(1, '氏名を入力してください')
    .max(100, '氏名は100文字以内で入力してください'),
  fullNameKana: z
    .string()
    .max(100, 'フリガナは100文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  email: z.string().email('有効なメールアドレスを入力してください').optional().or(z.literal('')),
  departmentId: uuidField('部署').optional().or(z.literal('')),
  position: z.string().max(100, '役職は100文字以内で入力してください').optional().or(z.literal('')),
  hiredOn: dateString.optional().or(z.literal('')),
  birthDate: dateString.optional().or(z.literal('')),
  status: employeeStatus.default('active'),
};

export const createEmployeeSchema = z.object(baseFields);

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  id: uuidField('従業員'),
  ...Object.fromEntries(
    Object.entries(baseFields).map(([key, schema]) => [key, schema.optional()]),
  ),
  // status だけは spread 後に明示的に上書きする。
  // baseFields の status は .default('active') を持つため、単に .optional() を
  // 被せると ZodOptional(ZodDefault) となり default が優先され、入力に status が
  // 無くても 'active' が出力される。updateEmployee は undefined のみスキップする
  // 実装なので、氏名だけの部分更新でも status が更新対象に入り、
  // retired / inactive の従業員が在籍に戻ってしまう。
  status: employeeStatus.optional(),
}) as z.ZodType<{ id: string } & Partial<CreateEmployeeInput>>;

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeListQuerySchema = z.object({
  page: pageField,
  perPage: perPageField(20),
  sort: sortField(
    ['employeeCode', 'fullName', 'email', 'position', 'hiredOn', 'status', 'createdAt'],
    'createdAt',
  ),
  order: orderField,
  search: z.string().optional(),
  status: employeeStatus.optional(),
  departmentId: uuidField('部署').optional(),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
