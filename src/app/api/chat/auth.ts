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

  const payload = JSON.parse(
    Buffer.from(session.access_token.split('.')[1], 'base64url').toString(),
  );
  const orgId = payload.app_metadata?.org_id;
  const role = payload.app_metadata?.role;

  if (!orgId || !role) return null;

  return { userId: user.id, orgId, role };
}
