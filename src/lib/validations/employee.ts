import { z } from 'zod';

const employeeStatus = z.enum(['active', 'inactive', 'retired']);

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
  email: z
    .string()
    .email('有効なメールアドレスを入力してください')
    .optional()
    .or(z.literal('')),
  departmentId: z.string().uuid('無効な部署IDです').optional().or(z.literal('')),
  position: z
    .string()
    .max(100, '役職は100文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  hiredOn: dateString.optional().or(z.literal('')),
  birthDate: dateString.optional().or(z.literal('')),
  status: employeeStatus.default('active'),
};

export const createEmployeeSchema = z.object(baseFields);

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  id: z.string().uuid(),
  ...Object.fromEntries(
    Object.entries(baseFields).map(([key, schema]) => [key, schema.optional()]),
  ),
}) as z.ZodType<{ id: string } & Partial<CreateEmployeeInput>>;

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(['employeeCode', 'fullName', 'email', 'position', 'hiredOn', 'status', 'createdAt'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  status: employeeStatus.optional(),
  departmentId: z.string().uuid().optional(),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
