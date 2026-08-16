import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください');

export const createOneOnOneSchema = z.object({
  employeeId: z.string().uuid('対象従業員を選択してください'),
  interviewerId: z.string().uuid('面談者を選択してください'),
  heldOn: dateString,
  notes: z
    .string()
    .max(5000, 'メモは5000文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  moodScore: z.coerce
    .number()
    .int()
    .min(1, 'コンディションは1以上で入力してください')
    .max(5, 'コンディションは5以下で入力してください')
    .optional()
    .or(z.literal(0).transform(() => undefined)),
});

export type CreateOneOnOneInput = z.infer<typeof createOneOnOneSchema>;

export const updateOneOnOneSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid('対象従業員を選択してください'),
  interviewerId: z.string().uuid('面談者を選択してください'),
  heldOn: dateString,
  notes: z
    .string()
    .max(5000, 'メモは5000文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  moodScore: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .or(z.literal(0).transform(() => undefined)),
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
