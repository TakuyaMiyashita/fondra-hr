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

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // Custom Access Token Hook が JWT クレームに org_id/role を埋め込む。
  // getUser() の app_metadata は DB 由来で Hook の値を含まないため、JWT から読む。
  const payload = JSON.parse(
    Buffer.from(session.access_token.split('.')[1], 'base64url').toString(),
  );
  const orgId = payload.app_metadata?.org_id;
  const role = payload.app_metadata?.role;

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
