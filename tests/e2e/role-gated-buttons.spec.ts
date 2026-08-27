import { test, expect } from '@playwright/test';

import { AUTH_FILES } from './authorization-fixtures';

/**
 * 書き込みボタンの出し分けが認可マトリクスと一致していることを、
 * 全ロール × 全一覧画面で横断的に確かめる。
 *
 * 防御の本体は Service Layer で、ここは UX の話。ただ「押しても必ず失敗する
 * ボタン」を出しておくのは案内として不親切で、認可マトリクスも UI での
 * 出し分けを責務に挙げている。
 *
 * 実際、導入前は member / viewer に**8箇所**の余計なボタンが出ていた。
 * 画面ごとに直すと再発しやすいので、横断で固定する。
 *
 * owner / admin 側も見るのが要。「出ないこと」だけを検証すると、
 * ボタンを消してしまっても気付けない。
 */

// [画面, ボタン名, その操作ができる最小ロール]
const CASES = [
  ['/employees', '新規登録', 'admin'],
  ['/departments', '部署を追加', 'admin'],
  ['/skills', 'スキルを追加', 'member'],
  ['/one-on-ones', '1on1を記録', 'member'],
  ['/evaluations', '評価サイクルを作成', 'admin'],
] as const;

const RANK = { owner: 4, admin: 3, member: 2, viewer: 1 } as const;

for (const [role, authFile] of [
  ['owner', AUTH_FILES.owner],
  ['member', AUTH_FILES.member],
  ['viewer', AUTH_FILES.viewer],
] as const) {
  test.describe(`${role} の書き込みボタン`, () => {
    test.use({ storageState: authFile });

    for (const [path, label, minRole] of CASES) {
      const allowed = RANK[role] >= RANK[minRole];

      test(`${path} の「${label}」は${allowed ? '出る' : '出ない'}`, async ({ page }) => {
        await page.goto(path);
        // 一覧が描画されるまで待つ（ボタンはヘッダーにあるので見出しで判定する）
        await expect(page.getByRole('heading').first()).toBeVisible();

        const button = page.getByRole('button', { name: label, exact: true });
        if (allowed) {
          await expect(button).toBeVisible();
        } else {
          await expect(button).toHaveCount(0);
        }
      });
    }
  });
}
