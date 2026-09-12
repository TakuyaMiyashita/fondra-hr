import { readFileSync } from 'node:fs';

import { test, expect } from '@playwright/test';

import { AUTH_FILES, FIXTURES_FILE, type Fixtures } from './authorization-fixtures';

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
  // 招待は member / viewer には無い操作（認可マトリクスの invitations 行が `-`）。
  // screen-inventory は admin と書いているのに、ここから漏れていた。
  ['/settings/members', '招待', 'admin'],
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

/**
 * 一覧だけでなく**従業員詳細**も見る。
 *
 * 詳細画面の編集・削除・匿名化・アバター変更は admin 以上に限っているが、
 * 一覧の CASES からは漏れていた。`docs/design/screen-inventory.md` は
 * admin と書いているのに、それを確かめるものが無い状態だった。
 *
 * とくに匿名化は個人情報を落とす操作で、出し分けが壊れたときの見え方が悪い。
 */
const DETAIL_BUTTONS = ['編集', '削除', '匿名化', 'プロフィール写真を変更'] as const;

const fixtures = (): Fixtures => JSON.parse(readFileSync(FIXTURES_FILE, 'utf-8'));

for (const [role, authFile] of [
  ['owner', AUTH_FILES.owner],
  ['member', AUTH_FILES.member],
  ['viewer', AUTH_FILES.viewer],
] as const) {
  test.describe(`${role} の従業員詳細の操作`, () => {
    test.use({ storageState: authFile });

    // 編集・削除・匿名化・アバター変更はいずれも admin 以上。
    const allowed = RANK[role] >= RANK.admin;

    for (const label of DETAIL_BUTTONS) {
      test(`/employees/[id] の「${label}」は${allowed ? '出る' : '出ない'}`, async ({ page }) => {
        await page.goto(`/employees/${fixtures().othersEmployeeId}`);
        // 詳細が描画されるまで待つ。タブは全ロールに出る。
        await expect(page.getByRole('tab', { name: '基本情報' })).toBeVisible();

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
