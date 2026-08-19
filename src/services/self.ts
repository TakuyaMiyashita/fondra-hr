import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { employees } from '@/db/schema/employees';
import type { AuthContext } from '@/services/auth-context';

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
