import { z } from 'zod';

import { uuidField } from './common';

export const signUpSchema = z.object({
  orgName: z
    .string()
    .min(1, '組織名を入力してください')
    .max(100, '組織名は100文字以内で入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const resetPasswordSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * 再設定リンクから来た利用者が新しいパスワードを決める（F-14）。
 *
 * 確認欄との一致は入力ミスで自分を締め出さないため。最小長はサインアップと
 * 同じ8文字（supabase/config.toml の minimum_password_length も 8）。
 */
export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    confirmPassword: z.string().min(1, '確認用のパスワードを入力してください'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

export const acceptInviteSchema = z.object({
  invitationId: uuidField('招待'),
  orgId: uuidField('組織'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], { message: '無効なロールです' }),
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  token: z.string().uuid('招待リンクが正しくありません'),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const switchOrgSchema = z.object({
  orgId: uuidField('組織'),
});

export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;
