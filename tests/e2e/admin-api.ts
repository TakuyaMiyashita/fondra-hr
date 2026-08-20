/**
 * e2e の前提データを service_role で直接投入するためのヘルパー。
 *
 * Playwright はテストファイル同士の import を禁止しているため、
 * global-setup と各スペックの両方から使う処理はここに置く。
 *
 * ここは「テストの前提を作る」ためのテストコード側の都合であり、
 * アプリの経路とは関係がない（プロダクトコードでは
 * `src/lib/supabase/admin.ts` の用途を Auth Admin API に限定している）。
 * service_role は RLS を丸ごとバイパスするため、
 * 投入先は必ず e2e 専用の組織に限ること。
 */

export const SUPABASE_URL = 'http://127.0.0.1:54321';
export const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: SERVICE_ROLE_KEY,
    ...extra,
  };
}

/** PostgREST の GET。`path` は `employees?org_id=eq.x&select=id` の形。 */
export async function adminSelect<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: adminHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed to select ${path}: ${JSON.stringify(json)}`);
  return json as T;
}

export async function adminInsert<T>(table: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed to insert into ${table}: ${JSON.stringify(json)}`);
  return json as T;
}

/** PostgREST の PATCH。`path` に必ず絞り込み条件を含めること。 */
export async function adminUpdate<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: adminHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed to update ${path}: ${JSON.stringify(json)}`);
  return json as T;
}

/** メールアドレスからユーザーを作る。既にいればその id を返す。 */
export async function ensureAuthUser(email: string, password: string): Promise<string> {
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { headers: adminHeaders() });
  const listData = (await listRes.json()) as { users?: { id: string; email: string }[] };
  const existing = listData.users?.find((u) => u.email === email);
  if (existing) return existing.id;

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = (await createRes.json()) as { id: string };
  if (!createRes.ok) throw new Error(`Failed to create user: ${JSON.stringify(created)}`);
  return created.id;
}

/**
 * メンバーシップだけ作れば JWT の claim は入る。
 * custom_access_token_hook は app_metadata に org_id が無ければ
 * 最初のメンバーシップにフォールバックするため、app_metadata の
 * 事前設定は要らない（supabase/migrations の同関数を参照）。
 */
export async function ensureMembership(userId: string, orgId: string, role: string): Promise<void> {
  const existing = await adminSelect<unknown[]>(
    `memberships?user_id=eq.${userId}&org_id=eq.${orgId}&select=user_id`,
  );
  if (existing.length > 0) return;
  await adminInsert('memberships', { user_id: userId, org_id: orgId, role });
}
