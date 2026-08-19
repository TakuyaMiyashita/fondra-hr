import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { employees } from '@/db/schema/employees';
import type { AuthContext } from '@/services/auth-context';
import { hasMinRole } from '@/services/authorize';

/**
 * ログインユーザーに紐付く従業員レコードの id を返す。紐付いていなければ null。
 *
 * 「自分が当事者のデータだけ編集できる」という制御は、ログインユーザー
 * （auth.users）と従業員レコードを突き合わせないと判定できない。
 * 紐付けは従業員のメールアドレスから自動的に行われる（src/services/employee.ts）。
 *
 * null が返るのは「メール未登録・不一致で紐付いていない」場合。
 * その場合は本人限定の操作ができない、という安全側に倒す。
 * 呼び出し側で null を「チェック不要」と解釈してはならない。
 */
export async function getOwnEmployeeId(ctx: AuthContext): Promise<string | null> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.orgId, ctx.orgId), eq(employees.userId, ctx.userId)))
    .limit(1);

  return row?.id ?? null;
}

/**
 * 1on1 の閲覧範囲。
 *
 * 1on1 の記録は本人の悩みや評価に関わる。作成・編集は既に「自分が当事者の
 * ものだけ」に絞ってあるが、閲覧が全ロールに開いたままだと、member が
 * 他人の面談メモを全件読めてしまい制限の意味が無い。読み取りも同じ範囲に揃える。
 *
 * admin 以上は人事・マネジメントの立場で全件を扱う。
 * 紐付いていない member / viewer は「自分の記録が無い」＝何も見えない、
 * という安全側に倒す（`none`）。呼び出し側で `none` を「制限なし」と
 * 解釈してはならない。
 */
export type OneOnOneScope =
  { kind: 'all' } | { kind: 'party'; employeeId: string } | { kind: 'none' };

export async function getOneOnOneScope(ctx: AuthContext): Promise<OneOnOneScope> {
  if (hasMinRole(ctx, 'admin')) {
    return { kind: 'all' };
  }

  const ownId = await getOwnEmployeeId(ctx);

  return ownId ? { kind: 'party', employeeId: ownId } : { kind: 'none' };
}
