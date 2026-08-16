import { z } from 'zod';

export const updateOrgSchema = z.object({
  name: z
    .string()
    .min(1, '組織名を入力してください')
    .max(100, '組織名は100文字以内で入力してください'),
});

export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .email('有効なメールアドレスを入力してください'),
  role: z.enum(['admin', 'member', 'viewer'], {
    message: 'ロールを選択してください',
  }),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const changeRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
