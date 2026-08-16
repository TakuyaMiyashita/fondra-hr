'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type Result, err } from '@/lib/result';
import { acceptInvitation } from '@/services/auth';
import type { Role } from '@/services/auth-context';

interface AcceptInviteInput {
  invitationId: string;
  orgId: string;
  role: string;
  email: string;
  password: string;
  token: string;
}

export async function acceptInviteAndSignUp(
  input: AcceptInviteInput,
): Promise<Result<void>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });

  if (error) {
    return err(error.message);
  }

  if (!data.user) {
    return err('ユーザーの作成に失敗しました');
  }

  const result = await acceptInvitation(
    input.invitationId,
    data.user.id,
    input.orgId,
    input.role as Role,
  );

  if (!result.success) {
    return err(result.error);
  }

  redirect('/login?registered=true');
}
