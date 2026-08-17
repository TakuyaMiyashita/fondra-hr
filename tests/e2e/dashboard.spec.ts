import { test, expect } from '@playwright/test';

test.describe('ダッシュボード', () => {
  test('displays dashboard page with stats cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByText('従業員数')).toBeVisible();
    await expect(page.getByText('部署数')).toBeVisible();
    await expect(page.getByText('スキル数')).toBeVisible();
    await expect(page.getByText('進行中の評価サイクル')).toBeVisible();
  });

  test('shows chart sections', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('部署別人数')).toBeVisible();
    await expect(page.getByText('従業員ステータス')).toBeVisible();
    await expect(page.getByText('スキルカテゴリ分布')).toBeVisible();
  });

  test('shows recent activity section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('最近のアクティビティ')).toBeVisible();
  });

  test('stat cards link to correct pages', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByText('従業員数').click();
    await expect(page).toHaveURL(/\/employees/);
  });
});
