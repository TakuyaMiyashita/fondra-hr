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

/**
 * サインアップ直後にアプリへ入れることの回帰テスト。
 *
 * signUp() が返すセッションは組織を作る前に発行されるため、JWT の
 * app_metadata.org_id が null のままになる。これを持ったまま画面に入ると
 *
 *   /dashboard → getAuthContext() が claim を読めず /login へ
 *   /login     → ミドルウェアが認証済みとみなし /dashboard へ
 *
 * を往復し続け、画面が真っ暗になる（検証環境で実際に発生）。
 *
 * バリデーションだけを見るテストではこの経路を一度も通らないため、
 * 「成功するサインアップ」を通してダッシュボードの描画まで確認する。
 */
test('signs up and lands on the dashboard without a redirect loop', async ({ page }) => {
  const id = Date.now().toString(36);

  await page.goto('/signup');
  await page.getByLabel('組織名').fill(`E2E Signup ${id}`);
  await page.getByLabel('メールアドレス').fill(`e2e-signup-${id}@test.example.com`);
  await page.getByLabel('パスワード').fill('e2e-password-123');
  await page.getByRole('button', { name: 'アカウントを作成' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // ループしている場合 URL だけ一致して中身が描画されないことがあるため、
  // ダッシュボードの実体が出ているところまで確認する。
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  // 往復していないこと（数秒後もダッシュボードに留まる）
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL(/\/dashboard/);
});
