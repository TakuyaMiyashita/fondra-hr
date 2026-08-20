/**
 * README 用のスクリーンショットを撮り直すスクリプト。
 *
 * デモシードのデータで撮る前提。実行前に以下を済ませておくこと。
 *   npx supabase db reset   # デモデータ投入
 *   pnpm dev                # localhost:3000
 *
 *   node scripts/capture-screenshots.mjs
 *
 * 画像は docs/images/ に上書きされる。UI を変えたら撮り直す。
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:3000';
const EMAIL = 'owner@fondra.example.com';
const PASSWORD = 'demo-password123';
const OUT = 'docs/images';

const shots = [
  { path: '/dashboard', name: 'dashboard', wait: 'svg' },
  { path: '/employees', name: 'employees', wait: 'tbody tr' },
  { path: '/departments', name: 'departments', wait: 'main' },
  { path: '/skills', name: 'skills', wait: 'main' },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'ja-JP',
});
const page = await context.newPage();

await mkdir(OUT, { recursive: true });

await page.goto(`${BASE}/login`);
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.getByRole('button', { name: 'ログイン' }).click();
await page.waitForURL('**/employees', { timeout: 20_000 });

for (const shot of shots) {
  await page.goto(`${BASE}${shot.path}`);
  await page.waitForLoadState('networkidle');
  await page
    .locator(shot.wait)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  // チャートのアニメーション待ち
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`captured: ${shot.name}`);
}

await browser.close();
