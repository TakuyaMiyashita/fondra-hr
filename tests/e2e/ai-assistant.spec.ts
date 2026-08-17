import { test, expect } from '@playwright/test';

test.describe('AI アシスタント', () => {
  test('displays AI assistant page', async ({ page }) => {
    await page.goto('/ai-assistant');
    await expect(page.getByRole('heading', { name: 'AI アシスタント' })).toBeVisible();
  });

  test('shows empty state with suggestions', async ({ page }) => {
    await page.goto('/ai-assistant');
    await expect(page.getByText('組織の概要を教えてください')).toBeVisible();
  });

  test('has message input', async ({ page }) => {
    await page.goto('/ai-assistant');
    await expect(page.getByPlaceholder(/メッセージを入力/)).toBeVisible();
  });
});
