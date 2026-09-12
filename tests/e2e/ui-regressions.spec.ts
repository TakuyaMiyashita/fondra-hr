import { test, expect } from '@playwright/test';

/**
 * 画面が壊れる回帰の検知。いずれも e2e を書いて初めて見つかった不具合で、
 * ユニットテストでは通り抜けていた。
 */

/**
 * Base UI の `Menu.GroupLabel` は `Menu.Group` の中でしか使えず、
 * 外に置くと開いた瞬間に MenuGroupContext is missing を投げる。
 * ヘッダーの2箇所（ユーザーメニュー・組織スイッチャー）は全画面に出るため、
 * 壊れるとアプリ全体でログアウトも組織切替もできなくなる。
 */
test.describe('ドロップダウンが開ける', () => {
  test('従業員一覧の表示列メニュー', async ({ page }) => {
    await page.goto('/employees');
    await page.getByRole('button', { name: '表示列' }).click();

    await expect(page.getByText('表示/非表示')).toBeVisible();
  });

  test('ヘッダーのユーザーメニュー', async ({ page }) => {
    await page.goto('/employees');
    await page.locator('header').getByRole('button').last().click();

    await expect(page.getByRole('menuitem', { name: 'ログアウト' })).toBeVisible();
  });

  test('組織スイッチャー', async ({ page }) => {
    await page.goto('/employees');
    await page
      .getByRole('button', { name: /組織|E2E/ })
      .first()
      .click();

    await expect(page.getByText('組織を切り替え')).toBeVisible();
  });
});

/**
 * useQuery の initialData を毎回渡すと、絞り込みでキーが変わっても
 * 新しいキーに同じ初期データが入り、常に新鮮とみなされて Server Action が
 * 呼ばれない。URL だけ変わって一覧が更新されず、リロードすると直る、
 * という気付きにくい症状になる。
 */
test('ステータス絞り込みがリロード無しで一覧に反映される', async ({ page }) => {
  await page.goto('/employees');
  await page.waitForLoadState('networkidle');
  const before = await page.locator('tbody tr').count();

  await page.goto('/employees?status=retired');
  await page.waitForLoadState('networkidle');
  const after = await page.locator('tbody tr').count();

  expect(after).not.toBe(before);
});

/**
 * ハイドレーション不一致が出ていないこと。
 *
 * **これは見た目では気づけない。** React は属性の不一致を patch up しないので、
 * 壊れた値（存在しない id を指す aria-describedby など）がそのまま残る。
 * 画面は正しく見えるのに支援技術からは壊れている、という形になる。
 *
 * 実際 `/departments` で dnd-kit が踏んでいた。`useUniqueId` が
 * モジュールスコープの可変カウンタで採番するため、プロセスが長生きする
 * サーバーとリロードのたびに 0 から始まるクライアントで必ずずれていた。
 */
const HYDRATION_PAGES = ['/dashboard', '/employees', '/departments', '/skills', '/audit-logs'];

for (const path of HYDRATION_PAGES) {
  test(`${path}: ハイドレーション不一致が出ない`, async ({ page }) => {
    const complaints: string[] = [];
    const capture = (text: string) => {
      if (/[Hh]ydrat|didn't match the client|server rendered/.test(text)) {
        complaints.push(text.slice(0, 400));
      }
    };
    page.on('console', (m) => capture(m.text()));
    page.on('pageerror', (e) => capture(String(e)));

    // **2回開く。** モジュールスコープのカウンタで採番するライブラリは、
    // 初回だけ server / client がどちらも 0 で一致してしまう。
    // ずれるのは2回目以降なので、1回のアクセスでは検出できない。
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    complaints.length = 0;

    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // ハイドレーションはロード完了の後に走る。少し待たないと取りこぼす。
    await page.waitForTimeout(1500);

    expect(complaints, complaints.join('\n---\n')).toEqual([]);
  });
}
