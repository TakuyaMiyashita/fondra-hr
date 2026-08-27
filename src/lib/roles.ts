import type { Role } from '@/services/auth-context';

/**
 * ロールの強さ。
 *
 * サーバー（`authorize()`）とクライアント（ボタンの出し分け）の両方が
 * 同じ順序を必要とする。分けて持つと、片方だけ直したときに
 * 「押せるのにボタンが無い」「ボタンはあるが必ず失敗する」がすぐ生まれる。
 * 定義はここ1箇所にして、両側から参照する。
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * `role` が `minRole` 以上か。
 *
 * サーバー側は `AuthContext` を持っているので `hasMinRole()`
 * （`src/services/authorize.ts`）を使う。こちらはロール名しか
 * 持たないクライアントコンポーネント向け。
 */
export function roleAtLeast(role: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
}
