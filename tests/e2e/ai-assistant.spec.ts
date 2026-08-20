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

/**
 * デモモード（ANTHROPIC_API_KEY 未設定）の応答が画面まで届くかを見る。
 *
 * AI SDK のストリーミングはコンポーネントテストから外してある
 * （docs/testing.md）。実 API を叩くテストは書かず、CI と同じく
 * キー未設定で返る固定応答が描画されるところまでを担保する。
 *
 * ここで見たいのは「返ってきたか」ではなく「画面に出たか」。
 * サーバーが 200 で流していても、クライアント側の読み取りが
 * ストリーム形式と噛み合っていなければ本文は永遠に出てこない。
 */
test.describe('AI アシスタント — デモモードの応答', () => {
  test('サジェストを押すとデモモードの固定応答が表示される', async ({ page }) => {
    await page.goto('/ai-assistant');
    await page.getByRole('button', { name: '組織の概要を教えてください' }).click();

    // 1文字ずつ流れてくるため、末尾まで届くのを待って全文で判定する
    await expect(
      page.getByText(/こちらはデモモードのため.*詳細は各管理画面をご覧ください。/),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('自由入力の質問はデモ応答の中にそのまま引用される', async ({ page }) => {
    const question = 'E2E-DEMO-QUESTION';
    const input = page.getByPlaceholder(/メッセージを入力/);

    await page.goto('/ai-assistant');
    await input.fill(question);
    await input.press('Enter');

    // 固定応答は改行を挟むため、前半と引用部分をそれぞれ見る
    await expect(page.getByText('これはデモモードの応答です。')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`ご質問: 「${question}」`)).toBeVisible();
    // 送信後に入力欄が空になることも同じ経路の一部
    await expect(input).toHaveValue('');
  });
});
