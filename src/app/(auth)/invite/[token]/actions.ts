'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type Result, err } from '@/lib/result';
import { acceptInvitation, getInvitationByToken } from '@/services/auth';
import { acceptInviteSchema } from '@/lib/validations/auth';

/**
 * 招待を受諾してアカウントを作成する。
 *
 * このアクションは未認証で到達できる公開 POST エンドポイントである。
 * フォームから届く invitationId / orgId / role / email は「画面の表示に使った値」に
 * すぎず、攻撃者が任意に差し替えられるため、いずれも信用してはならない。
 *
 * 唯一の信用の起点は token であり、招待レコードはサーバー側で引き直す。
 * getInvitationByToken は「未受諾」「未失効」を DB 側の条件で担保しているため、
 * ここで見つからなければ無効・期限切れ・使用済みのいずれかである。
 */
export async function acceptInviteAndSignUp(data: {
  invitationId: string;
  orgId: string;
  role: string;
  email: string;
  password: string;
  token: string;
}): Promise<Result<void>> {
  const parsed = acceptInviteSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  // token 以外のクライアント値は以降一切参照しない
  const invitation = await getInvitationByToken(parsed.data.token);
  if (!invitation) {
    return err('この招待リンクは無効か、期限切れです');
  }

  const supabase = await createClient();

  // メールアドレスも招待レコードのものを使う。
  // クライアント指定を許すと、有効なトークンを入手した第三者が
  // 別アドレスのアカウントで組織に参加できてしまう。
  const { data: authData, error } = await supabase.auth.signUp({
    email: invitation.email,
    password: parsed.data.password,
  });

  if (error) {
    return err(error.message);
  }

  if (!authData.user) {
    return err('ユーザーの作成に失敗しました');
  }

  const result = await acceptInvitation(
    invitation.id,
    authData.user.id,
    invitation.orgId,
    invitation.role,
  );

  if (!result.success) {
    return err(result.error);
  }

  redirect('/login?registered=true');
}
