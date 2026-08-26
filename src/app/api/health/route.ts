import { isDatabaseReachable } from '@/services/health';

/**
 * 死活確認。DB に到達できるかだけを返す。
 *
 * 認証を要求しないのが要。DB が落ちているときは画面が全滅するが、
 * 認証は別系統なのでログインだけは通る。この状態だと「ログインできるのに
 * 全画面エラー」となり、原因が DB なのかアプリなのか切り分けられない。
 * ここだけは認証に依存させず、常に答えられるようにする
 * （公開パスの扱いは `src/lib/supabase/middleware.ts`）。
 *
 * **返すのは ok / error だけ**。接続先・ユーザー名・エラー本文は返さない。
 * 認証不要の経路なので、外に出してよい情報だけに絞る。
 */
export async function GET() {
  const ok = await isDatabaseReachable();

  return Response.json(
    { status: ok ? 'ok' : 'error', database: ok ? 'ok' : 'error' },
    { status: ok ? 200 : 503 },
  );
}
