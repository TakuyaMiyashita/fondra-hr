import { test, expect } from '@playwright/test';

test.describe('設定', () => {
  test('displays settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
  });

  test('shows organization name input', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('#org-name')).toBeVisible();
  });

  test('navigates to members page', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: 'メンバー' }).click();
    await expect(page).toHaveURL(/\/settings\/members/);
  });

  // **exact を付ける。** 保留中の招待があると1件ごとに
  // 「<メール> への招待を取り消す」ボタンが並び、部分一致では複数に当たる。
  const inviteButton = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: '招待', exact: true });

  test('members page shows invite button', async ({ page }) => {
    await page.goto('/settings/members');
    await expect(inviteButton(page)).toBeVisible();
  });

  test('opens invite dialog', async ({ page }) => {
    await page.goto('/settings/members');
    await inviteButton(page).click();
    await expect(page.locator('#invite-email')).toBeVisible();
  });
});
