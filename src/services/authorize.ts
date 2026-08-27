import { roleAtLeast } from '@/lib/roles';

import type { AuthContext, Role } from './auth-context';

type Action = 'create' | 'read' | 'update' | 'delete';

const WRITE_ACTIONS: Action[] = ['create', 'update', 'delete'];

export class AuthorizationError extends Error {
  constructor(
    public readonly action: Action,
    public readonly resource: string,
  ) {
    super(`Unauthorized: ${action} on ${resource}`);
    this.name = 'AuthorizationError';
  }
}

/**
 * 公開デモの組織に対する書き込みを拒んだときのエラー。
 *
 * ロール不足ではないので `AuthorizationError` と区別できるようにする。
 * owner でログインした人が「権限がありません」と言われると、
 * 認可が壊れているように見えてデモの趣旨と正反対になる。
 *
 * `AuthorizationError` を継承しているのは、Server Action 側の
 * `catch (e) { if (e instanceof AuthorizationError) ... }` をそのまま
 * 効かせるため。文言だけ `authorizationMessage()` で出し分ける。
 */
export class DemoReadOnlyError extends AuthorizationError {
  constructor(action: Action, resource: string) {
    super(action, resource);
    this.name = 'DemoReadOnlyError';
  }
}

export const DEMO_READ_ONLY_MESSAGE =
  'デモ環境のデータは変更できません。手元で動かすと自由に編集できます（README の「動かす」を参照）';

/**
 * 認可エラーを画面に出す文言に変換する。
 *
 * Server Action の catch は全て同じ形なので、ここに集約する。
 */
export function authorizationMessage(e: AuthorizationError): string {
  return e instanceof DemoReadOnlyError ? DEMO_READ_ONLY_MESSAGE : '権限がありません';
}

/**
 * 公開デモの組織か。
 *
 * README は owner / admin / member / viewer の資格情報を公開している。
 * 認可の効き方をロールごとに見せるのがデモの主目的なので、ログインは
 * 4ロールとも開けておきたい。一方で owner の資格情報が公開されている以上、
 * 何もしなければ誰でも従業員を全削除でき、組織名も書き換えられる。
 *
 * そこで**この組織に対する書き込みだけ**を止める。読み取りは止めない
 * （生年月日のマスクや 1on1 の当事者限定といった見せ場は読み取り側にある）。
 *
 * 環境変数が未設定なら何も起きない。ローカル開発・CI・テストは素通りする。
 * 対象を組織で絞っているので、サインアップして自分の組織を作った人は
 * そちらには自由に書ける。凍るのはデモ組織だけ。
 */
function isDemoReadOnlyOrg(orgId: string): boolean {
  const demoOrgId = process.env.DEMO_READONLY_ORG_ID;
  return !!demoOrgId && demoOrgId === orgId;
}

export function authorize(
  ctx: AuthContext,
  action: Action,
  resource: string,
  check?: (ctx: AuthContext) => boolean,
): void {
  const isWrite = WRITE_ACTIONS.includes(action);

  // ロール判定より先に見る。デモ組織では、どのロールでも結論は同じ。
  if (isWrite && isDemoReadOnlyOrg(ctx.orgId)) {
    throw new DemoReadOnlyError(action, resource);
  }

  if (ctx.role === 'viewer' && isWrite) {
    throw new AuthorizationError(action, resource);
  }

  if (check && !check(ctx)) {
    throw new AuthorizationError(action, resource);
  }
}

export function hasMinRole(ctx: AuthContext, minRole: Role): boolean {
  return roleAtLeast(ctx.role, minRole);
}
