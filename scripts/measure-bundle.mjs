/**
 * ルート固有の JS バンドルサイズを測る。
 *
 * **素朴に「ページを開いて JS の転送量を数える」と、全ルートがほぼ同じ数字に
 * なる。** サイドバーの全リンクを Next が prefetch するため。これは遷移を
 * 速くする意図した挙動で、問題ではない。
 *
 * ルート固有のコストを見るには、**ルートごとに新しいブラウザコンテキストを
 * 作り**（前のルートのキャッシュを持ち込まない）、基準ルートとの
 * **集合差**を取る。総量の引き算では prefetch の分が相殺されて意味を失う。
 *
 * **バイト数だけでは遅延読み込みの効果は見えない。** `next/dynamic` は総量を
 * 減らさず後ろにずらすだけなので、この表はほとんど動かない。ずらせたかどうかは
 * `--throttle` の方で測る（帯域を絞って、意味のある最初の表示までの時間を見る）。
 * localhost は帯域制約が無いため、絞らないとバイト数の差が時間に出ない。
 *
 * 使い方（本番ビルドに対して測る。dev は最小化もされず数字が別物になる）:
 *
 *   pnpm build
 *   PORT=3100 pnpm start &
 *   node scripts/measure-bundle.mjs --base-url http://localhost:3100
 *   node scripts/measure-bundle.mjs --base-url http://localhost:3100 --throttle
 *
 * 認証が要るので `pnpm test:e2e` を一度通して
 * `tests/e2e/.auth/user.json` を作っておくこと。
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const baseUrl = args[args.indexOf('--base-url') + 1] ?? 'http://localhost:3000';
const storageStatePath = 'tests/e2e/.auth/user.json';

/** 1番目を基準ルートとして、残りとの集合差を取る。 */
const ROUTES = ['/employees', '/dashboard', '/skills', '/audit-logs', '/settings'];

/** そのルートを開いたときに読まれた JS を URL → バイト数で返す。 */
async function collect(browser, route) {
  // ルートごとに新しいコンテキスト。前のルートのキャッシュを持ち込まない。
  const context = await browser.newContext({
    storageState: JSON.parse(readFileSync(storageStatePath, 'utf8')),
  });
  const page = await context.newPage();
  const scripts = new Map();

  page.on('response', async (res) => {
    const url = res.url();
    if (!/\.js(\?|$)/.test(url)) return;
    try {
      scripts.set(url, (await res.body()).length);
    } catch {
      // リダイレクトなどで本文が取れないことがある。数えられない分は落とす。
    }
  });

  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await context.close();
  return scripts;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/**
 * 帯域を絞って `/dashboard` の統計カードが読めるようになるまでを測る。
 *
 * **「JS が何 KB 読み込まれた時点か」では測れない。** サイドバーの prefetch が
 * 競合し、同じビルドでも 113〜330 KB と3倍近く振れる。何秒で読めるように
 * なったかは prefetch の順序に左右されず安定する。
 */
async function measureThrottled(browser) {
  const results = [];
  for (let i = 0; i < 3; i += 1) {
    const context = await browser.newContext({
      storageState: JSON.parse(readFileSync(storageStatePath, 'utf8')),
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    // Fast 3G 相当。
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });

    const startedAt = Date.now();
    await page.goto(`${baseUrl}/dashboard`);
    await page.getByText('従業員数').first().waitFor({ state: 'visible', timeout: 120_000 });
    results.push(Date.now() - startedAt);
    await context.close();
  }
  return results.sort((a, b) => a - b);
}

const browser = await chromium.launch();
try {
  if (args.includes('--throttle')) {
    const ms = await measureThrottled(browser);
    console.log(`/dashboard の統計カードが読めるまで（Fast 3G, 3回）: ${ms.join(' / ')} ms`);
    process.exit(0);
  }

  const [baseRoute, ...rest] = ROUTES;
  const base = await collect(browser, baseRoute);
  const baseTotal = [...base.values()].reduce((a, b) => a + b, 0);

  const rows = [[baseRoute, kb(baseTotal), '基準']];
  for (const route of rest) {
    const scripts = await collect(browser, route);
    const total = [...scripts.values()].reduce((a, b) => a + b, 0);
    // 集合差。基準ルートで読まれていない JS だけがそのルート固有のコスト。
    let own = 0;
    for (const [url, size] of scripts) if (!base.has(url)) own += size;
    rows.push([route, kb(total), kb(own)]);
  }

  console.log('| ルート | 総JS（prefetch込み） | ルート固有 |');
  console.log('| --- | --- | --- |');
  for (const [route, total, own] of rows) {
    console.log(`| \`${route}\` | ${total} | ${own} |`);
  }
} finally {
  await browser.close();
}
