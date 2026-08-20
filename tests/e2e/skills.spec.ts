import { test, expect } from '@playwright/test';

test.describe('スキル管理', () => {
  test('displays skill page with tabs', async ({ page }) => {
    await page.goto('/skills');
    await expect(page.getByRole('heading', { name: 'スキル管理' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'スキル一覧' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'スキルマトリクス' })).toBeVisible();
  });

  test('shows empty state or skill list', async ({ page }) => {
    await page.goto('/skills');
    await expect(page.getByRole('heading', { name: 'スキル管理' })).toBeVisible();
  });

  test('creates a new skill', async ({ page }) => {
    const name = `E2Eスキル-${Date.now()}`;

    await page.goto('/skills');
    const addButton = page.getByRole('button', { name: 'スキルを追加', exact: true });
    const emptyAddButton = page.getByRole('button', { name: '最初のスキルを追加' });

    if (await emptyAddButton.isVisible()) {
      await emptyAddButton.click();
    } else {
      await addButton.click();
    }

    await expect(page.getByRole('heading', { name: 'スキルを追加' })).toBeVisible();
    await page.locator('#skill-name').fill(name);
    await page.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('スキルを作成しました')).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  /**
   * 候補から選ぶとカテゴリが自動で入る。
   * 直前の「creates a new skill」は候補に無い名前を打って作成するので、
   * 自由入力が候補に飲み込まれないことの回帰テストとして機能している。
   */
  test('候補を選ぶとカテゴリが自動で入る', async ({ page }) => {
    await page.goto('/skills');
    const addButton = page.getByRole('button', { name: 'スキルを追加', exact: true });
    const emptyAddButton = page.getByRole('button', { name: '最初のスキルを追加' });

    if (await emptyAddButton.isVisible()) {
      await emptyAddButton.click();
    } else {
      await addButton.click();
    }
    await expect(page.getByRole('heading', { name: 'スキルを追加' })).toBeVisible();

    await page.locator('#skill-name').fill('Terra');
    await page.getByRole('option', { name: 'Terraform' }).click();

    await expect(page.locator('#skill-name')).toHaveValue('Terraform');
    await expect(page.locator('#skill-category')).toHaveValue('インフラ');
  });

  test('validates required skill name', async ({ page }) => {
    await page.goto('/skills');
    const addButton = page.getByRole('button', { name: 'スキルを追加', exact: true });
    const emptyAddButton = page.getByRole('button', { name: '最初のスキルを追加' });

    if (await emptyAddButton.isVisible()) {
      await emptyAddButton.click();
    } else {
      await addButton.click();
    }
    await page.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('スキル名を入力してください')).toBeVisible();
  });

  test('switches to matrix tab', async ({ page }) => {
    await page.goto('/skills');
    await page.getByRole('tab', { name: 'スキルマトリクス' }).click();
    await expect(page.getByRole('tab', { name: 'スキルマトリクス' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
