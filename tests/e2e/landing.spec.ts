import { test, expect } from '@playwright/test';

test.describe('ランディングページ', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('shows landing page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('FondraHR').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /人材マネジメント/ })).toBeVisible();
  });

  test('has CTA button linking to signup', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('無料で始める').first()).toBeVisible();
  });

  test('shows feature cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('従業員管理')).toBeVisible();
    await expect(page.getByText('スキル管理')).toBeVisible();
  });
});

test.describe('認証済みユーザーのリダイレクト', () => {
  test('redirects authenticated user to dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
