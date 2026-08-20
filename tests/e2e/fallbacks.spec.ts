import { test, expect } from '@playwright/test';

/**
 * 横断フォールバック（404 / エラー境界）の配線確認。
 *
 * これらは「コンポーネントが正しく描画されるか」ではなく
 * 「ファイルが Next.js の規約どおりの場所に置かれ、実際に使われるか」が本題。
 * ユニットテストは import して描画するだけなので、置き場所を間違えても通る。
 */

test.describe('404', () => {
  test('存在しない URL で自前の 404 画面が出る', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');

    await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'トップに戻る' })).toHaveAttribute('href', '/');
  });

  test('トップに戻るボタンで LP へ遷移できる', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('link', { name: 'トップに戻る' }).click();

    // 認証済みのため `/` はダッシュボードへリダイレクトされる
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('招待承認', () => {
  /**
   * `getInvitationByToken()` でデータ取得しているため loading.tsx / error.tsx が
   * 要る。無効なトークンは例外ではなく「招待が無効です」を返す設計なので、
   * error.tsx ではなく通常描画に落ちることをここで固定する。
   */
  test('無効なトークンはエラー境界ではなく案内画面に落ちる', async ({ page }) => {
    await page.goto('/invite/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('招待が無効です')).toBeVisible();
    await expect(page.getByText('招待の読み込みに失敗しました')).toBeHidden();
  });
});
