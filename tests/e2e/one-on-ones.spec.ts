import { test, expect } from '@playwright/test';

// 1on1 の登録には従業員が必要だが、他 spec の実行順に依存すると壊れやすいため、
// ここでは画面描画・ダイアログ・バリデーションまでを対象にしている。
test.describe('1on1記録', () => {
  test('displays one-on-one page', async ({ page }) => {
    await page.goto('/one-on-ones');
    // exact 指定がないと空状態の見出し「1on1記録がありません」にも部分一致する。
    await expect(page.getByRole('heading', { name: '1on1記録', exact: true })).toBeVisible();
  });

  test('shows empty state or record list', async ({ page }) => {
    await page.goto('/one-on-ones');
    const emptyHeading = page.getByRole('heading', { name: '1on1記録がありません' });
    const recordButton = page.getByRole('button', { name: '1on1を記録', exact: true });
    await expect(emptyHeading.or(recordButton).first()).toBeVisible();
  });

  test('opens the record dialog', async ({ page }) => {
    await page.goto('/one-on-ones');
    await openRecordDialog(page);

    await expect(page.getByRole('heading', { name: '1on1を記録' })).toBeVisible();
    await expect(page.locator('#oo-held-on')).toBeVisible();
    await expect(page.locator('#oo-notes')).toBeVisible();
  });

  test('validates required employee selection', async ({ page }) => {
    await page.goto('/one-on-ones');
    await openRecordDialog(page);

    await page.locator('#oo-held-on').fill('2026-06-01');
    await page.getByRole('button', { name: '記録', exact: true }).click();

    await expect(page.getByText('対象従業員を選択してください')).toBeVisible();
  });
});

// 空状態では見出し内の CTA、一覧表示時はヘッダーのボタンから開く。
async function openRecordDialog(page: import('@playwright/test').Page) {
  const emptyCta = page.getByRole('button', { name: '最初の1on1を記録' });
  if (await emptyCta.isVisible()) {
    await emptyCta.click();
  } else {
    await page.getByRole('button', { name: '1on1を記録', exact: true }).click();
  }
}
