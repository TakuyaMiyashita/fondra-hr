import { test, expect } from '@playwright/test';

import { AUTH_FILES } from './authorization-fixtures';

/**
 * 監査ログに機微な値が残らないことの検証。
 *
 * 監査ログは全ロールが読める（docs/database/authorization-matrix.md）。
 * 変更内容を素通しで記録すると、viewer が監査ログ画面を開くだけで
 * 生年月日・1on1 の面談メモ・評価コメントが読めてしまい、
 * src/services/field-visibility.ts と src/services/self.ts の
 * 可視制御が丸ごと打ち消される。
 *
 * ここでは実際に owner が生年月日つきで従業員を登録し、
 * その値が viewer の監査ログ画面に出ないことを確かめる。
 */

// 他の従業員データと衝突しない、この spec 専用の生年月日。
const SECRET_BIRTH_DATE = '1966-04-19';

test.describe('監査ログの機微フィールド', () => {
  test('viewer の監査ログに生年月日の値が出ない', async ({ browser }) => {
    const code = `AUDIT-${Date.now().toString(36).toUpperCase()}`;

    // --- owner として、生年月日つきで従業員を登録する ---
    const ownerContext = await browser.newContext({ storageState: AUTH_FILES.owner });
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto('/employees');
    await ownerPage.getByRole('button', { name: '新規登録' }).click();
    await ownerPage.locator('#employeeCode').fill(code);
    await ownerPage.locator('#fullName').fill('監査ログ検証用');
    await ownerPage.locator('#birthDate').fill(SECRET_BIRTH_DATE);
    await ownerPage.getByRole('button', { name: '登録' }).click();
    await expect(ownerPage.getByText('従業員を登録しました')).toBeVisible();

    await ownerContext.close();

    // --- viewer として監査ログを開く ---
    const viewerContext = await browser.newContext({ storageState: AUTH_FILES.viewer });
    const viewerPage = await viewerContext.newPage();

    await viewerPage.goto('/audit-logs');
    await expect(viewerPage.getByRole('heading', { name: '監査ログ', exact: true })).toBeVisible();

    // 変更内容はポップオーバーの中にあるので開く。
    const changesTrigger = viewerPage.getByRole('button', { name: /項目$/ }).first();
    await expect(changesTrigger).toBeVisible();
    await changesTrigger.click();

    await expect(viewerPage.getByRole('heading', { name: '変更内容' })).toBeVisible();

    // 生年月日の値そのものは、ページのどこにも出てはならない。
    await expect(viewerPage.getByText(SECRET_BIRTH_DATE)).toHaveCount(0);

    await viewerContext.close();
  });
});
