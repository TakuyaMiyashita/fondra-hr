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
 * 評価コメントを見せてよいか。admin 以上、または自分が評価者の評価。
 *
 * 被評価者本人にも見せない。評価の確定・開示フロー（status の遷移に応じた
 * 本人開示）が未実装のため、下書き段階のコメントが本人に流れる方が事故が大きい。
 * 開示フローを実装するときにここを緩める。
 *
 * `ownEmployeeId` が null（未紐付け）なら `evaluatorId` とは一致しないので、
 * 「自分の評価が無い」＝見えない、と安全側に倒れる。
 */
export function canReadEvaluationComment(
  ctx: AuthContext,
  evaluatorId: string,
  ownEmployeeId: string | null,
): boolean {
  return canReadPersonalData(ctx) || evaluatorId === ownEmployeeId;
}
