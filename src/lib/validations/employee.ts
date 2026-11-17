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

/**
 * アバター画像の上限。**バケット（avatars）の file_size_limit と一致させる。**
 * 以前はアプリ側だけ 5MB で、2〜5MB のファイルはアプリの検証を通ってから
 * Storage で拒否され、Storage の生エラーが画面に出ていた。
 * 定義元: supabase/migrations/20260816000001_create_avatars_bucket.sql
 */
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

/** バケットの allowed_mime_types と同じ3種。 */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 保存パスの拡張子に使うため、拡張子も別途ホワイトリストで縛る。 */
export const ALLOWED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

const INVALID_AVATAR_FORMAT = '許可されていないファイル形式です（jpg, png, webp のみ）';

/** ファイル名の拡張子を小文字で返す。保存パスの組み立てにも使う。 */
export function avatarExtension(file: Pick<File, 'name'>): string {
  return (file.name.split('.').pop() ?? '').toLowerCase();
}

/**
 * アバターのアップロード入力。
 *
 * `formData.get('file')` は文字列も返しうる（UI を経由しない呼び出し）。
 * `File` であることを確かめずに `file.name` を触ると例外になる。
 *
 * MIME はクライアント申告の値で、偽装はできる。それでもバケット側と
 * 同じ条件をアプリでも先に見ておけば、Storage の生エラーを画面に
 * 出さずに済む。
 */
export const uploadAvatarSchema = z.object({
  employeeId: uuidField('従業員'),
  file: z
    .instanceof(File, { message: 'ファイルが選択されていません' })
    .refine(
      (file) => (ALLOWED_AVATAR_EXTENSIONS as readonly string[]).includes(avatarExtension(file)),
      INVALID_AVATAR_FORMAT,
    )
    .refine(
      (file) => (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type),
      INVALID_AVATAR_FORMAT,
    )
    .refine((file) => file.size <= MAX_AVATAR_SIZE, 'ファイルサイズが大きすぎます（最大2MB）'),
});

export type UploadAvatarInput = z.infer<typeof uploadAvatarSchema>;
