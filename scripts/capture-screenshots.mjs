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

// click: 撮る前に押すタブ。スキル画面は既定が「スキル一覧」なので、
// 見せたいマトリクス側に切り替えてから撮る。
// waitAfter: クリック後に描画を待つ要素。マトリクスは TanStack Query で
// クライアント取得するため、待たずに撮ると Skeleton が写る。
const shots = [
  { path: '/dashboard', name: 'dashboard', wait: 'svg' },
  { path: '/employees', name: 'employees', wait: 'tbody tr' },
  { path: '/departments', name: 'departments', wait: 'main' },
  {
    path: '/skills',
    name: 'skills',
    wait: 'main',
    click: 'スキルマトリクス',
    waitAfter: 'table tbody tr',
  },
];

// Next.js の開発オーバーレイ（左下の丸いインジケータ）はスクリーンショットに
// 写り込むので隠す。dev サーバーに対して撮る以上どうしても出るため、
// devIndicators を切るのではなく撮影時だけ CSS で消す。
const HIDE_DEV_OVERLAY = 'nextjs-portal, #__next-build-watcher { display: none !important; }';

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
  if (shot.click) {
    await page.getByRole('tab', { name: shot.click }).click();
  }
  if (shot.waitAfter) {
    await page.locator(shot.waitAfter).first().waitFor({ timeout: 15_000 });
  }
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY });
  // チャートのアニメーション待ち
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`captured: ${shot.name}`);
}

await browser.close();
