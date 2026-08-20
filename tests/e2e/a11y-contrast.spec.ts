import { test, expect, type Page } from '@playwright/test';

/**
 * コントラスト比の検証。
 *
 * **トークンの値ではなく、ブラウザが解決した実際の色を測る。**
 * `--tw-ring-color` は `color-mix()` を経由し、フォーカスリングの不透明度は
 * `globals.css` のレイヤー外規則で上書きしている。計算上そうなるはず、では
 * 確かめたことにならない。
 *
 * axe の `color-contrast` は**テキストしか見ない**ので、フォーカスリング
 * （非テキスト・SC 1.4.11）とグラフの系列色はここでしか担保できない。
 */

/**
 * フォーカス中の要素のリング色を、その要素の実際の背景と比べる。
 *
 * **`:focus-visible` はスクリプトからの `focus()` では一致しない。** Tab で
 * 辿る必要がある。また `boxShadow` の文字列には ring-offset の透明値が先に
 * 並ぶため、そこから色を拾うと透明を掴む。`--tw-ring-color` と
 * `--tw-ring-shadow`（幅）を直接見るのが確実。
 */
function focusRingProbe() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;

  const cs = getComputedStyle(el);
  const ringShadow = cs.getPropertyValue('--tw-ring-shadow').trim();
  const ringColor = cs.getPropertyValue('--tw-ring-color').trim();
  const hasRing =
    el.matches(':focus-visible') && !!ringColor && /calc\((\d*\.?\d+)px/.test(ringShadow);

  const slot = el.dataset.slot ?? '';
  if (!hasRing) return { slot, ring: null };

  /** 透明な背景を持つ要素があるので、実際に色を持つ祖先まで遡る。 */
  const effectiveBg = (node: HTMLElement | null): string => {
    for (let n: HTMLElement | null = node; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !/,\s*0\s*\)$/.test(bg) && bg !== 'transparent') return bg;
    }
    return getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const paint = (bg: string, fg?: string) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1, 1);
    if (fg) {
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };
  const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]: number[]) =>
    0.2126 * dec(r / 255) + 0.7152 * dec(g / 255) + 0.0722 * dec(b / 255);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  const bg = effectiveBg(el.parentElement);
  return {
    slot,
    ring: { css: ringColor, contrast: ratio(lum(paint(bg, ringColor)), lum(paint(bg))) },
  };
}

/** ブラウザ側で走らせる。CSS の色文字列から相対輝度を出してコントラスト比を返す。 */
function contrastProbe() {
  // getComputedStyle は oklch を lab() のまま返すことがあり、文字列から
  // 数値を拾うと RGB として誤読する。canvas に実際に描いて sRGB を得る。
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  /** bg の上に fg を重ねて描き、合成後の sRGB を返す。半透明でも実際の見え方になる。 */
  const paint = (bgCss: string, fgCss?: string): [number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = bgCss;
    ctx.fillRect(0, 0, 1, 1);
    if (fgCss) {
      ctx.fillStyle = fgCss;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };

  const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]: number[]) =>
    0.2126 * dec(r / 255) + 0.7152 * dec(g / 255) + 0.0722 * dec(b / 255);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();

  const bgCss = v('--background');
  const cardCss = v('--card');
  const bgLum = lum(paint(bgCss));
  const cardLum = lum(paint(cardCss));

  const against = (css: string) => ({
    onBackground: ratio(lum(paint(bgCss, css)), bgLum),
    onCard: ratio(lum(paint(cardCss, css)), cardLum),
  });

  return {
    charts: [1, 2, 3, 4, 5].map((i) => ({ name: `--chart-${i}`, ...against(v(`--chart-${i}`)) })),
    mutedForeground: against(v('--muted-foreground')),
  };
}

async function gotoWithTheme(page: Page, path: string, theme: 'light' | 'dark') {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

function readFocusRing(page: Page) {
  return page.evaluate(focusRingProbe);
}

async function measure(page: Page, theme: 'light' | 'dark') {
  await gotoWithTheme(page, '/dashboard', theme);
  return page.evaluate(contrastProbe);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} テーマ`, () => {
    test('フォーカスリングが 3:1 以上（WCAG 2.2 SC 1.4.11）', async ({ page }) => {
      await gotoWithTheme(page, '/skills', theme);

      // どれか1つを選ぶと「その要素だけ直っている」を見逃す。
      // Tab で辿れる範囲を走査し、リングが出ている要素を全て検査する。
      const measured: { slot: string; css: string; contrast: number }[] = [];
      for (let i = 0; i < 20; i += 1) {
        await page.keyboard.press('Tab');
        const probe = await readFocusRing(page);
        if (probe?.ring) {
          measured.push({ slot: probe.slot, css: probe.ring.css, contrast: probe.ring.contrast });
        }
      }

      expect(measured.length, 'リングを持つ要素に1つも到達できなかった').toBeGreaterThan(3);
      // shadcn Button（ring-ring/50）とサイドバーの両方を通ること
      expect(measured.some((m) => m.slot === 'sidebar-menu-button')).toBe(true);
      expect(measured.some((m) => m.slot.includes('trigger') || m.slot === 'button')).toBe(true);

      for (const m of measured) {
        expect(m.contrast, `${m.slot} のリング ${m.css}`).toBeGreaterThanOrEqual(3);
      }
    });

    test('グラフの系列色が背景と 3:1 以上', async ({ page }) => {
      const { charts } = await measure(page, theme);

      for (const c of charts) {
        expect(c.onBackground, `${c.name} が背景に沈んでいる`).toBeGreaterThanOrEqual(3);
        expect(c.onCard, `${c.name} がカード上で沈んでいる`).toBeGreaterThanOrEqual(3);
      }
    });

    test('補助テキストが 4.5:1 以上', async ({ page }) => {
      const { mutedForeground } = await measure(page, theme);

      expect(mutedForeground.onBackground).toBeGreaterThanOrEqual(4.5);
      expect(mutedForeground.onCard).toBeGreaterThanOrEqual(4.5);
    });
  });
}
