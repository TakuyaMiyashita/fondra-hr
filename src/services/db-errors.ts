/**
 * DB エラーの判定。
 *
 * 「既に存在するか確かめてから書く」形の処理は、確認と書き込みの間に
 * 別のリクエストが入ると壊れる（TOCTOU）。同時実行を本当に止められるのは
 * DB の一意制約だけなので、制約違反を拾って、事前チェックと同じ
 * ユーザー向けメッセージに変換する。
 *
 * これが無いと、競合したときだけ Postgres の生のエラーが Server Action を
 * 突き抜けてエラー画面になる。事前チェックに引っかかった場合と
 * 挙動が食い違うのは、利用者から見て理不尽。
 */

/** Postgres の unique_violation。 */
const UNIQUE_VIOLATION = '23505';

/**
 * 一意制約違反か。`constraint` を渡すと、その制約に限って判定する。
 *
 * 制約名を指定できるようにしているのは、1つのテーブルに複数の一意制約が
 * あるとき（将来増えたとき）に、無関係な違反まで同じメッセージで
 * 握り潰さないため。
 */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  if (typeof e !== 'object' || e === null) return false;

  const err = e as { code?: unknown; constraint_name?: unknown };
  if (err.code !== UNIQUE_VIOLATION) return false;

  return constraint === undefined || err.constraint_name === constraint;
}
