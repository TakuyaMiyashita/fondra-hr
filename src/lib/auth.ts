import { redirect } from 'next/navigation';

import type { AuthContext } from '@/services/auth-context';
import type { Role } from '@/services/auth-context';

import { createClient } from './supabase/server';

export function parseJwtClaims(accessToken: string): { orgId: string; role: Role } | null {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
  const orgId = payload.app_metadata?.org_id;
  const role = payload.app_metadata?.role;
  if (!orgId || !role) return null;
  return { orgId, role };
}

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

  const claims = parseJwtClaims(session.access_token);
  if (!claims) {
    redirect('/login');
  }

  return {
    userId: user.id,
    orgId: claims.orgId,
    role: claims.role,
  };
}

export async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
