import { z } from 'zod';

export const signUpSchema = z.object({
  orgName: z.string().min(1, '組織名を入力してください').max(100, '組織名は100文字以内で入力してください'),
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

export const acceptInviteSchema = z.object({
  invitationId: z.string().uuid(),
  orgId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  email: z.string().email(),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  token: z.string().uuid(),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const switchOrgSchema = z.object({
  orgId: z.string().uuid('無効な組織IDです'),
});

export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;
