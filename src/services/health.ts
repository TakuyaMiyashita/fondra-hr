import { sql } from 'drizzle-orm';

import { db } from '@/db';

/**
 * DB に到達できるかだけを確かめる。
 *
 * 他の Service Layer の関数と違い `authorize()` を通さない。
 * 認証（Supabase Auth）と DB アクセス（Drizzle）は別系統で、DB だけ落ちると
 * 「ログインはできるのに全画面エラー」になる。その切り分けに使うものなので、
 * 認証の後ろに置くと肝心なときに使えない。
 * 認証ブートストラップ関数（`createOrganizationWithOwner` 等）と同じ扱い。
 *
 * 例外は投げず真偽値で返す。呼び出し側（Route Handler）が
 * エラー画面ではなくステータスコードで答えられるようにするため。
 */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    // 詳細はサーバーのログに出る。呼び出し側には真偽値しか渡さない。
    return false;
  }
}
