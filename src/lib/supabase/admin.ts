import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * service_role キーを使う管理者クライアント。
 *
 * 用途は Auth Admin API（app_metadata の更新）に限定する。
 * DB アクセスは Drizzle ORM のみ（CLAUDE.md）なので、このクライアントで
 * テーブルを読み書きしてはならない。RLS を丸ごとバイパスするため、
 * 必ず「サーバー側でメンバーシップを検証した後」にだけ呼ぶこと。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が設定されていません');
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
