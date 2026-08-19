'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { type Result, err, ok } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  PENDING_ORG_NAME_KEY,
  createOrganizationWithOwner,
  switchOrganization,
} from '@/services/auth';
import {
  signUpSchema,
  signInSchema,
  resetPasswordSchema,
  switchOrgSchema,
} from '@/lib/validations/auth';

export async function signUp(data: {
  email: string;
  password: string;
  orgName: string;
}): Promise<Result<void>> {
  const parsed = signUpSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // 確認メールのリンク先。これを指定しないと Supabase の site_url に飛び、
      // /auth/callback を通らないため保留分が消化されない。
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      // 組織名は確認後に使うので預けておく（下記コメント参照）。
      data: { [PENDING_ORG_NAME_KEY]: parsed.data.orgName },
    },
  });

  if (error) {
    return err(error.message);
  }

  if (!authData.user) {
    return err('ユーザーの作成に失敗しました');
  }

  // メール確認が有効な場合、signUp() はセッションを返さない（未確認のため）。
  // ここで組織を作ると、確認されなかった登録のぶんだけ「誰も入れない組織」が
  // DB に残り続ける。作成は確認後（/auth/callback → completePendingSignUp）へ
  // 遅らせ、ここでは確認を促すためログイン画面へ送る。
  if (!authData.session) {
    redirect('/login?registered=true');
  }

  const orgResult = await createOrganizationWithOwner(authData.user.id, parsed.data.orgName);
  if (!orgResult.success) {
    return err(orgResult.error);
  }

  // signUp() が返すセッションは「組織を作る前」に発行されている。その時点では
  // メンバーシップが無いため、JWT フックは app_metadata.org_id / role に null を
  // 書き込む。このトークンのまま画面に入ると getAuthContext() が claim を読めず
  // /login へリダイレクトし、ミドルウェアは認証済みとみなして /dashboard へ戻すため、
  // トークンが失効する1時間まで無限リダイレクトになる。
  // 組織を作った「後」にリフレッシュして、claim の入ったトークンを発行し直す。
  await supabase.auth.refreshSession();
  redirect('/dashboard');
}

export async function signIn(data: { email: string; password: string }): Promise<Result<void>> {
  const parsed = signInSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.message === 'Invalid login credentials') {
      return err('メールアドレスまたはパスワードが正しくありません');
    }
    return err(error.message);
  }

  redirect('/employees');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resetPassword(data: { email: string }): Promise<Result<void>> {
  const parsed = resetPasswordSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/settings`,
  });

  if (error) {
    return err(error.message);
  }

  return ok(undefined);
}

/**
 * 組織を切り替える。
 *
 * JWT フック（custom_access_token_hook）が読むのは **app_metadata** なので、
 * updateUser() が書く user_metadata に org_id を入れても切り替わらない。
 * app_metadata はクライアントから書き換えられない領域であり、更新には
 * service_role の Auth Admin API が要る。
 *
 * service_role は RLS を丸ごとバイパスするため、書き込む前に必ず
 * switchOrganization() でメンバーシップを検証する。クライアントから渡された
 * orgId を無検証で app_metadata に書くと、所属していない組織の JWT を
 * 発行できてしまい権限昇格になる。
 */
export async function switchOrg(data: { orgId: string }): Promise<Result<void>> {
  const parsed = switchOrgSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err('ログインが必要です');
  }

  const membership = await switchOrganization(user.id, parsed.data.orgId);
  if (!membership.success) {
    return err(membership.error);
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { org_id: membership.data.orgId, role: membership.data.role },
  });

  if (error) {
    return err('組織の切り替えに失敗しました');
  }

  // リフレッシュを挟まないと直後の RSC が切替前の JWT を読み、
  // 旧テナントのデータが表示される。
  await supabase.auth.refreshSession();
  redirect('/employees');
}
