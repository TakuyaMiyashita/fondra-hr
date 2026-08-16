import { redirect } from 'next/navigation';

import type { AuthContext } from '@/services/auth-context';

import { createClient } from './supabase/server';

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const orgId = user.app_metadata?.org_id;
  const role = user.app_metadata?.role;

  if (!orgId || !role) {
    redirect('/login');
  }

  return {
    userId: user.id,
    orgId,
    role,
  };
}

export async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
