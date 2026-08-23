import type { AuthContext } from '@/services/auth-context';
import { hasMinRole } from '@/services/authorize';

/**
 * 個人情報のフィールド単位の可視性を判定する。
 *
 * 行レベルの認可（`authorize()` / `getOwnEmployeeId()`）が「そのレコードを
 * 読めるか」を決めるのに対し、ここは「読めるレコードの中で、この列まで
 * 見せてよいか」を決める。従業員は全ロールが read 可（認可マトリクス）なので、
 * 行単位では弾けない生年月日・評価コメントをこの層で落とす。
 *
 * マスクは値を null に潰す形で行う。「未設定」と見分けが付かなくなるが、
 * 「マスクされている」という事実自体を伝えない方が安全で、既存の型
 * （いずれも nullable）と UI（null は「—」表示）をそのまま使える。
 */

/** admin 以上は個人情報を無条件で閲覧できる。 */
export function canReadPersonalData(ctx: AuthContext): boolean {
  return hasMinRole(ctx, 'admin');
}

/**
 * 生年月日を見せてよいか。admin 以上、または本人。
 *
 * `employeeUserId` が null（ログインユーザーと未紐付け）の従業員は
 * 誰の「本人」でもないため、member / viewer からは常に隠れる。
 */
export function canReadBirthDate(ctx: AuthContext, employeeUserId: string | null): boolean {
  return canReadPersonalData(ctx) || employeeUserId === ctx.userId;
}

/**
 * 評価の中身（コメント本文と評点）を見せてよいか。
 *
 * - admin 以上 … 無条件
 * - 自分が評価者の評価 … 無条件（書いた本人なので）
 * - 自分が被評価者の評価 … **確定（confirmed）後のみ**
 *
 * 被評価者への開示を確定後に限るのは、下書き・入力中・差戻しの段階の
 * 内容が本人に流れると、書き手が推敲できないまま評価が伝わるため。
 * 確定は開示のスイッチそのものなので、そこへの遷移は admin 以上に限定して
 * ある（`updateEvaluation`）。評価者が自分で倒せると、開示のタイミングを
 * 評価者が握ることになる。
 *
 * **評点（`ratings`）もコメントと同じ扱いにする。** 「何点を付けられたか」は
 * 「何と書かれたか」と同じだけ機微で、コメントだけ伏せて評点が素通しでは
 * 隠す意味が無い。評価の *存在*（誰が誰を評価するか）は人事運用上オープンで
 * よいので、そちらは絞らない。
 *
 * `ownEmployeeId` が null（未紐付け）ならどの id とも一致しないので、
 * 「自分の評価が無い」＝見えない、と安全側に倒れる。
 */
export function canReadEvaluationDetail(
  ctx: AuthContext,
  evaluation: { evaluatorId: string; employeeId: string; status: string },
  ownEmployeeId: string | null,
): boolean {
  if (canReadPersonalData(ctx)) {
    return true;
  }

  if (evaluation.evaluatorId === ownEmployeeId) {
    return true;
  }

  return evaluation.employeeId === ownEmployeeId && evaluation.status === 'confirmed';
}
