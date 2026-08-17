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

  test('members page shows invite button', async ({ page }) => {
    await page.goto('/settings/members');
    await expect(page.getByRole('button', { name: '招待' })).toBeVisible();
  });

  test('opens invite dialog', async ({ page }) => {
    await page.goto('/settings/members');
    await page.getByRole('button', { name: '招待' }).click();
    await expect(page.locator('#invite-email')).toBeVisible();
  });
});
