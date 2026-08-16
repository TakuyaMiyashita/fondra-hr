'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type Result, err } from '@/lib/result';
import { acceptInvitation } from '@/services/auth';
import type { Role } from '@/services/auth-context';
import { acceptInviteSchema } from '@/lib/validations/auth';

export async function acceptInviteAndSignUp(
  data: {
    invitationId: string;
    orgId: string;
    role: string;
    email: string;
    password: string;
    token: string;
  },
): Promise<Result<void>> {
  const parsed = acceptInviteSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return err(error.message);
  }

  if (!authData.user) {
    return err('ユーザーの作成に失敗しました');
  }

  const result = await acceptInvitation(
    parsed.data.invitationId,
    authData.user.id,
    parsed.data.orgId,
    parsed.data.role as Role,
  );

  if (!result.success) {
    return err(result.error);
  }

  redirect('/login?registered=true');
}
