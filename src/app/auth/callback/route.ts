import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  PENDING_INVITATION_TOKEN_KEY,
  PENDING_ORG_NAME_KEY,
  completePendingSignUp,
} from '@/services/auth';

/**
 * メール確認 / パスワード再設定リンクの受け口。
 *
 * メール確認が有効な場合、サインアップ時点では組織・メンバーシップを作らず
 * user_metadata に内容を預けてある（src/app/(auth)/actions.ts の signUp）。
 * 確認が済んだこの時点で消化する。
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/employees';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const pending = await completePendingSignUp(
    data.user.id,
    data.user.email,
    data.user.user_metadata,
  );

  if (!pending.success) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(pending.error)}`);
  }

  if (pending.data.created) {
    // 預けた内容は消化済み。残しておくと、退会などで所属が無くなった後に
    // 同じコールバックを通ったとき古い招待を引き直そうとする。
    await supabase.auth.updateUser({
      data: { [PENDING_ORG_NAME_KEY]: null, [PENDING_INVITATION_TOKEN_KEY]: null },
    });

    // exchangeCodeForSession が発行した JWT はメンバーシップ作成前のもので、
    // app_metadata.org_id が null のまま。リフレッシュしないとリダイレクト
    // ループになる（src/app/(auth)/actions.ts の signUp のコメント参照）。
    await supabase.auth.refreshSession();
  }

  return NextResponse.redirect(`${origin}${next}`);
}
