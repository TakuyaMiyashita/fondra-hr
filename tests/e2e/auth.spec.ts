import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('redirects unauthenticated user to login', async ({ page }) => {
  await page.goto('/employees');
  await expect(page).toHaveURL(/\/login/);
});

test('shows validation errors on empty login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('メールアドレスを入力してください')).toBeVisible();
});

test('shows validation errors on empty signup', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: 'アカウントを作成' }).click();
  await expect(page.getByText('組織名を入力してください')).toBeVisible();
});

test('navigates between login and signup', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'サインアップ' }).click();
  await expect(page).toHaveURL(/\/signup/);

  await page.getByRole('link', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/login/);
});
