import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * 接続文字列が無いまま起動すると、postgres.js は既定値（ローカルの
 * peer 認証）にフォールバックし、クエリを投げた時点で初めて
 * 「role "root" does not exist」のような無関係な例外になる。
 * 設定漏れだと気付けないので、ここで落とす。
 */
function requireConnectionString(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL が設定されていません。Vercel では Transaction pooler（ポート 6543）の接続文字列を設定します（docs/deployment.md）',
    );
  }

  return url;
}

const client = postgres(requireConnectionString(), { prepare: false });

export const db = drizzle(client, { schema });
