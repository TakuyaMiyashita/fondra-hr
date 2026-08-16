'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type Result, err, ok } from '@/lib/result';
import { createOrganizationWithOwner } from '@/services/auth';

export async function signUp(
  email: string,
  password: string,
  orgName: string,
): Promise<Result<void>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return err(error.message);
  }

  if (!data.user) {
    return err('ユーザーの作成に失敗しました');
  }

  const orgResult = await createOrganizationWithOwner(data.user.id, orgName);
  if (!orgResult.success) {
    return err(orgResult.error);
  }

  redirect('/login?registered=true');
}

export async function signIn(
  email: string,
  password: string,
): Promise<Result<void>> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message === 'Invalid login credentials') {
      return err('メールアドレスまたはパスワードが正しくありません');
    }
    return err(error.message);
  }

  redirect('/employees');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resetPassword(email: string): Promise<Result<void>> {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/settings`,
  });

  if (error) {
    return err(error.message);
  }

  return ok(undefined);
}

export async function switchOrg(orgId: string): Promise<void> {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: { org_id: orgId },
  });

  await supabase.auth.refreshSession();
  redirect('/employees');
}
