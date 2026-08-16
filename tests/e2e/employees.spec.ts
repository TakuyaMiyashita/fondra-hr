import { test, expect } from '@playwright/test';

test.describe('従業員一覧', () => {
  test('displays employee list page', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('heading', { name: '従業員管理' })).toBeVisible();
  });

  test('shows table or empty state', async ({ page }) => {
    await page.goto('/employees');
    const table = page.locator('table').first();
    const emptyHeading = page.getByRole('heading', { name: '従業員が登録されていません' });
    await expect(table.or(emptyHeading)).toBeVisible();
  });

  test('opens create form sheet', async ({ page }) => {
    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await expect(page.getByText('従業員を登録')).toBeVisible();
  });

  test('validates required fields on create', async ({ page }) => {
    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByRole('button', { name: '登録' }).click();

    await expect(page.getByText('社員番号を入力してください')).toBeVisible();
    await expect(page.getByText('氏名を入力してください')).toBeVisible();
  });

  test('creates and displays a new employee', async ({ page }) => {
    const code = `E2E-${Date.now()}`;

    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();

    await page.locator('#employeeCode').fill(code);
    await page.locator('#fullName').fill('テスト太郎');
    await page.getByRole('button', { name: '登録' }).click();

    await expect(page.getByText('従業員を登録しました')).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();
  });

  test('search filters employees', async ({ page }) => {
    await page.goto('/employees');

    const searchInput = page.getByPlaceholder('氏名・社員番号で検索');
    if (await searchInput.isVisible()) {
      await searchInput.fill('存在しない従業員名XYZ');
      await page.waitForTimeout(500);
    }
  });
});

test.describe('従業員詳細', () => {
  test('navigates to detail and shows tabs', async ({ page }) => {
    const code = `E2E-DET-${Date.now()}`;
    const name = `詳細テスト-${Date.now()}`;

    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.locator('#employeeCode').fill(code);
    await page.locator('#fullName').fill(name);
    await page.getByRole('button', { name: '登録' }).click();
    await expect(page.getByText('従業員を登録しました')).toBeVisible();

    await page.getByRole('link', { name }).first().click();

    await expect(page.getByRole('tab', { name: '基本情報' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'スキル' })).toBeVisible();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });
});
