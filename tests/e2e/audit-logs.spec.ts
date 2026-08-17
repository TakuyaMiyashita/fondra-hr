import { test, expect } from '@playwright/test';

test.describe('監査ログ', () => {
  test('displays audit log page', async ({ page }) => {
    await page.goto('/audit-logs');
    // exact 指定がないと空状態の見出し「監査ログがまだありません」にも部分一致する。
    await expect(page.getByRole('heading', { name: '監査ログ', exact: true })).toBeVisible();
  });

  test('shows empty state or log table', async ({ page }) => {
    await page.goto('/audit-logs');
    const emptyHeading = page.getByRole('heading', { name: '監査ログがまだありません' });
    const table = page.getByRole('columnheader', { name: '日時' });
    await expect(emptyHeading.or(table).first()).toBeVisible();
  });

  test('records an audit entry when data changes', async ({ page }) => {
    // 監査ログは Service Layer が自動で書き込む。スキルを1件作成したあと、
    // 監査ログ画面にそのエントリが現れることを確認する。
    const skillName = `E2E監査スキル-${Date.now()}`;

    await page.goto('/skills');
    const emptyCta = page.getByRole('button', { name: '最初のスキルを追加' });
    if (await emptyCta.isVisible()) {
      await emptyCta.click();
    } else {
      await page.getByRole('button', { name: 'スキルを追加', exact: true }).click();
    }
    await page.locator('#skill-name').fill(skillName);
    await page.getByRole('button', { name: '作成' }).click();
    await expect(page.getByText('スキルを作成しました')).toBeVisible();

    await page.goto('/audit-logs');
    await expect(page.getByRole('columnheader', { name: '日時' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'スキル' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: '作成' }).first()).toBeVisible();
  });

  test('filters by resource type', async ({ page }) => {
    await page.goto('/audit-logs');

    const filter = page.getByRole('combobox').first();
    if (!(await filter.isVisible())) {
      test.skip(true, '監査ログが空のためフィルタが描画されていない');
    }

    await filter.click();
    await page.getByRole('option', { name: 'スキル', exact: true }).click();

    // この画面のフィルタは URL 状態ではなくローカル state で持ち、
    // 絞り込みは非同期に再取得される。クエリパラメータではなく
    // 描画結果が置き換わるのを待って検証する。
    const rows = page.locator('tbody tr');
    // 「スキル割当」と区別するため exact 指定が必要。
    const skillCells = page.getByRole('cell', { name: 'スキル', exact: true });

    await expect(async () => {
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      expect(await skillCells.count()).toBe(rowCount);
    }).toPass({ timeout: 10_000 });
  });
});
