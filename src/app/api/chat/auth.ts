import { parseJwtClaims } from '@/lib/auth';
import { getActiveMembership } from '@/services/auth';
import type { AuthContext } from '@/services/auth-context';
import { createClient } from '@/lib/supabase/server';

export async function getAuthContextForApi(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const claims = parseJwtClaims(session.access_token);
  if (!claims) return null;

  // role の権威は DB（`src/lib/auth.ts` の getAuthContext と同じ理由）。
  const membership = await getActiveMembership(user.id, claims.orgId);
  if (!membership) return null;

  return { userId: user.id, orgId: claims.orgId, role: membership.role };
}
