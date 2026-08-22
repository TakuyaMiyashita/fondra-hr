import { test, expect } from '@playwright/test';

test.describe('組織図', () => {
  test('displays department page', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.getByRole('heading', { name: '組織図' })).toBeVisible();
  });

  test('shows empty state or tree', async ({ page }) => {
    await page.goto('/departments');
    const emptyHeading = page.getByRole('heading', { name: '部署がまだ登録されていません' });
    const addButton = page.getByRole('button', { name: '部署を追加' });
    // 空状態では見出しと「部署を追加」ボタンが同時に存在するため、
    // .or() は 2 要素にマッチする（strict mode 違反）。
    // ここで確認したいのは「どちらかが描画されていること」なので first() を取る。
    await expect(emptyHeading.or(addButton).first()).toBeVisible();
  });

  test('creates a new department', async ({ page }) => {
    const name = `E2E部署-${Date.now()}`;

    await page.goto('/departments');
    await page.getByRole('button', { name: '部署を追加' }).click();

    await expect(page.getByRole('heading', { name: '部署を作成' })).toBeVisible();
    await page.locator('#dept-name').fill(name);
    await page.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('部署を作成しました')).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test('validates required department name', async ({ page }) => {
    await page.goto('/departments');
    await page.getByRole('button', { name: '部署を追加' }).click();
    await page.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('部署名を入力してください')).toBeVisible();
  });

  test('edits a department', async ({ page }) => {
    const originalName = `編集前-${Date.now()}`;
    const updatedName = `編集後-${Date.now()}`;

    await page.goto('/departments');
    await page.getByRole('button', { name: '部署を追加' }).click();
    await page.locator('#dept-name').fill(originalName);
    await page.getByRole('button', { name: '作成' }).click();
    await expect(page.getByText('部署を作成しました')).toBeVisible();

    // ダイアログが閉じるのを待つ
    await expect(page.getByRole('heading', { name: '部署を作成' })).toBeHidden();

    // ドロップダウンを開く
    const row = page.getByText(originalName).locator('..');
    await row.hover();
    const menuButton = row.locator('button').last();
    await menuButton.click();
    await page.getByRole('menuitem', { name: '編集' }).click();

    await page.locator('#dept-name').clear();
    await page.locator('#dept-name').fill(updatedName);
    await page.getByRole('button', { name: '更新' }).click();

    await expect(page.getByText('部署を更新しました')).toBeVisible();
    await expect(page.getByText(updatedName)).toBeVisible();
  });

  test('deletes a department', async ({ page }) => {
    const name = `削除対象-${Date.now()}`;

    await page.goto('/departments');
    await page.getByRole('button', { name: '部署を追加' }).click();
    await page.locator('#dept-name').fill(name);
    await page.getByRole('button', { name: '作成' }).click();
    await expect(page.getByText('部署を作成しました')).toBeVisible();

    // ダイアログが閉じるのを待つ
    await expect(page.getByRole('heading', { name: '部署を作成' })).toBeHidden();

    // ドロップダウンを開く
    const row = page.getByText(name).locator('..');
    await row.hover();
    const menuButton = row.locator('button').last();
    await menuButton.click();
    await page.getByRole('menuitem', { name: '削除' }).click();

    await expect(page.getByRole('heading', { name: '部署を削除' })).toBeVisible();
    await page.getByRole('button', { name: '削除' }).click();

    await expect(page.getByText('部署を削除しました')).toBeVisible();
  });
});
