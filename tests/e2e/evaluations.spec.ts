import { test, expect } from '@playwright/test';

// E2E 用組織はシードデータを持たないため、空状態と一覧のどちらでも
// 成立するアサーションにしている（他の spec と同じ方針）。
test.describe('評価', () => {
  test('displays evaluation page', async ({ page }) => {
    await page.goto('/evaluations');
    await expect(page.getByRole('heading', { name: '評価', exact: true })).toBeVisible();
  });

  test('shows empty state or cycle list', async ({ page }) => {
    await page.goto('/evaluations');
    const emptyHeading = page.getByRole('heading', {
      name: '評価サイクルがまだ作成されていません',
    });
    const createButton = page.getByRole('button', { name: '評価サイクルを作成' });
    await expect(emptyHeading.or(createButton).first()).toBeVisible();
  });

  test('creates a new evaluation cycle', async ({ page }) => {
    const name = `E2E評価サイクル-${Date.now()}`;

    await page.goto('/evaluations');
    await openCycleDialog(page);

    await expect(page.getByRole('heading', { name: '評価サイクルを作成' })).toBeVisible();
    await page.locator('#cycle-name').fill(name);
    await page.locator('#cycle-start').fill('2026-04-01');
    await page.locator('#cycle-end').fill('2026-09-30');
    await page.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('評価サイクルを作成しました')).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test('validates required cycle name', async ({ page }) => {
    await page.goto('/evaluations');
    await openCycleDialog(page);

    await page.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('評価サイクル名を入力してください')).toBeVisible();
  });
});

// 空状態では見出し内の CTA、一覧表示時はヘッダーのボタンから開く。
async function openCycleDialog(page: import('@playwright/test').Page) {
  const emptyCta = page.getByRole('button', { name: '最初の評価サイクルを作成' });
  if (await emptyCta.isVisible()) {
    await emptyCta.click();
  } else {
    await page.getByRole('button', { name: '評価サイクルを作成' }).click();
  }
}
