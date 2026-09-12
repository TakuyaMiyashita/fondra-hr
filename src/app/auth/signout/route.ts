import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * セッションを破棄してログイン画面へ戻す。
 *
 * **`getAuthContext()` から逃がすために要る。** メンバーシップが消えた
 * ユーザーを RSC から `/login` へリダイレクトすると、ミドルウェアが
 * 「認証済み」と見てダッシュボードへ戻し、リダイレクトループになる
 * （Supabase の認証そのものは生きているため）。
 *
 * cookie を消せるのは Route Handler と Server Action だけで、RSC では消せない
 * （`src/lib/supabase/server.ts` の catch がそれを飲み込んでいる）。
 * そのため RSC からはここへ飛ばし、ここで実際にサインアウトする。
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // 元の URL のクエリは引き継がない。取り消された組織の id などが
  // ログイン画面に残らないようにする。
  const { origin } = new URL(request.url);
  const url = new URL('/login', origin);
  // 黙ってログイン画面に戻されると理由が分からないので伝える。
  url.searchParams.set('reason', 'membership-revoked');

  return NextResponse.redirect(url);
}
