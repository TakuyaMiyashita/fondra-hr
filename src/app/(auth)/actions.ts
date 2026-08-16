'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type Result, err, ok } from '@/lib/result';
import { createOrganizationWithOwner } from '@/services/auth';
import {
  signUpSchema,
  signInSchema,
  resetPasswordSchema,
  switchOrgSchema,
} from '@/lib/validations/auth';

export async function signUp(data: {
  email: string;
  password: string;
  orgName: string;
}): Promise<Result<void>> {
  const parsed = signUpSchema.safeParse(data);
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

  const orgResult = await createOrganizationWithOwner(authData.user.id, parsed.data.orgName);
  if (!orgResult.success) {
    return err(orgResult.error);
  }

  redirect('/login?registered=true');
}

export async function signIn(data: {
  email: string;
  password: string;
}): Promise<Result<void>> {
  const parsed = signInSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
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

export async function resetPassword(data: {
  email: string;
}): Promise<Result<void>> {
  const parsed = resetPasswordSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/settings`,
  });

  if (error) {
    return err(error.message);
  }

  return ok(undefined);
}

export async function switchOrg(data: { orgId: string }): Promise<void> {
  const parsed = switchOrgSchema.safeParse(data);
  if (!parsed.success) {
    return;
  }

  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: { org_id: parsed.data.orgId },
  });

  await supabase.auth.refreshSession();
  redirect('/employees');
}
