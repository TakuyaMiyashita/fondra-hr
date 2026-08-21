/**
 * ロール別 e2e の共有定数。
 *
 * Playwright はテストファイル同士の import を禁止しているため、
 * global-setup とスペックの両方から使う値はここに置く。
 *
 * 判定用の値には E2E- で始まるマーカー文字列を使う。セレクタに依存せず
 * 「この文字列がページのどこにも出ていないこと」を検証できるため、
 * マスク漏れの検出に強い。
 */

export const E2E_PASSWORD = 'e2e-test-password123';
export const OWNER_EMAIL = 'e2e-test@example.com';
export const MEMBER_EMAIL = 'e2e-member@example.com';
export const VIEWER_EMAIL = 'e2e-viewer@example.com';

export const AUTH_FILES = {
  owner: 'tests/e2e/.auth/user.json',
  member: 'tests/e2e/.auth/member.json',
  viewer: 'tests/e2e/.auth/viewer.json',
} as const;

export const FIXTURES_FILE = 'tests/e2e/.auth/fixtures.json';

/** 画面に出てはいけない / 出るべき値。 */
export const MARKERS = {
  selfBirthDate: '1971-03-07',
  othersBirthDate: '1962-11-23',
  selfComment: 'E2E-VISIBLE-COMMENT-SELF',
  othersComment: 'E2E-SECRET-COMMENT-OTHERS',
  selfNotes: 'E2E-VISIBLE-NOTES-SELF',
  othersNotes: 'E2E-SECRET-NOTES-OTHERS',
  confirmedComment: 'E2E-CONFIRMED-COMMENT-FOR-SELF',
  unconfirmedComment: 'E2E-UNCONFIRMED-COMMENT-FOR-SELF',
  cycleName: 'E2E認可テストサイクル',
  /**
   * スキルマトリクスの検証用。従業員とスキルが両方1件以上ないと
   * マトリクスは空状態になり、セル取得のクエリ自体が実行されない。
   */
  skillName: 'E2Eマトリクス検証スキル',
} as const;

export interface Fixtures {
  orgId: string;
  selfEmployeeId: string;
  othersEmployeeId: string;
}
