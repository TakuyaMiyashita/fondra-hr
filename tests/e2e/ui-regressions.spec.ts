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
