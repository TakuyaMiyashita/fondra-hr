import { redirect } from 'next/navigation';

import { getActiveMembership } from '@/services/auth';
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

  // **role は JWT ではなく DB を権威にする。** claim はトークン発行時の値で、
  // 既定で1時間有効（`jwt_expiry = 3600`）。その間に管理者がメンバーを
  // 削除・降格しても手元のトークンは変わらないため、claim を信じると
  // 最大1時間は元の権限で通る。claim は「どの組織を見ているか」にだけ使う。
  const membership = await getActiveMembership(user.id, claims.orgId);
  if (!membership) {
    // **`/login` に直接飛ばすとループする。** Supabase の認証自体は生きているので、
    // ミドルウェアが「認証済み」と見てダッシュボードへ戻してしまう。
    // cookie を消せるのは Route Handler なので、そちらへ逃がす。
    redirect('/auth/signout');
  }

  return {
    userId: user.id,
    orgId: claims.orgId,
    role: membership.role,
  };
}

export async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
