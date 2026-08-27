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

/**
 * 画面上の**実テキスト要素**を走査してコントラスト比を測る。
 *
 * トークンを1つずつ測る方式では、そのトークンが実際にどの背景の上に
 * 置かれているかが分からない。`--muted-foreground` は `--background` の上では
 * 合格しても、別の背景の上では落ちうる。**描かれている組み合わせをそのまま測る**
 * のがここの役割。
 *
 * axe の `color-contrast` はこれを標準ルールとして持っているが、
 * **`lab()` を誤読して false positive を出す**ため使えない
 * （`a11y-axe.spec.ts` の除外理由を参照）。同じ検査を canvas 実測で自前に持つ。
 */
function textContrastProbe(limit: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  /**
   * 下から順に重ねて描き、合成後の sRGB を返す。半透明もそのまま反映される。
   *
   * **結果をキャッシュする。** `getImageData` は GPU からの読み戻しで、
   * 1要素あたり2回呼ぶと数百要素のページで実用にならない速度になる。
   * 色の組み合わせはページ内で激しく重複するので、キャッシュがほぼ全て効く。
   */
  const paintCache = new Map<string, [number, number, number]>();
  const composite = (layers: string[]): [number, number, number] => {
    const key = layers.join('|');
    const hit = paintCache.get(key);
    if (hit) return hit;

    ctx.clearRect(0, 0, 1, 1);
    for (const css of layers) {
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const rgb: [number, number, number] = [r, g, b];
    paintCache.set(key, rgb);
    return rgb;
  };

  const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]: number[]) =>
    0.2126 * dec(r / 255) + 0.7152 * dec(g / 255) + 0.0722 * dec(b / 255);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  const isTransparent = (css: string) =>
    !css || css === 'transparent' || /,\s*0\s*\)$/.test(css.replace(/\s/g, ' '));

  const rootBg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();

  /**
   * 祖先を遡って背景のレイヤーを集める。
   *
   * **「最初に見つかった不透明な背景」で止めてはいけない。** 半透明の背景は
   * その下の色と混ざって見えるので、外側から順に重ねないと実際の色にならない。
   */
  // 親の結果は子でそのまま使える。要素ごとに根まで遡ると O(深さ) が積み上がる。
  const layerCache = new Map<Element, { layers: string[]; unmeasurable: string | null }>();
  const backgroundLayers = (el: Element): { layers: string[]; unmeasurable: string | null } => {
    const hit = layerCache.get(el);
    if (hit) return hit;

    const parent = el.parentElement;
    const base = parent
      ? backgroundLayers(parent)
      : { layers: [rootBg], unmeasurable: null as string | null };

    const cs = getComputedStyle(el);
    // グラデーション・画像の上の文字は単色で近似できない。測らず記録する。
    const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
    const result = {
      layers: isTransparent(cs.backgroundColor)
        ? base.layers
        : [...base.layers, cs.backgroundColor],
      unmeasurable: hasImage ? cs.backgroundImage.slice(0, 60) : base.unmeasurable,
    };
    layerCache.set(el, result);
    return result;
  };

  /** 祖先の opacity は掛け算で効く。文字色の実効アルファに畳み込む。 */
  const opacityCache = new Map<Element, number>();
  const effectiveOpacity = (el: Element): number => {
    const hit = opacityCache.get(el);
    if (hit !== undefined) return hit;

    const parent = el.parentElement;
    const o = (parent ? effectiveOpacity(parent) : 1) * Number(getComputedStyle(el).opacity || '1');
    opacityCache.set(el, o);
    return o;
  };

  const withAlpha = (color: string, alpha: number) => {
    if (alpha >= 1) return color;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255) * alpha})`;
  };

  /** 直接の子に空白でないテキストを持つ要素だけを見る。親まで数えると二重になる。 */
  const hasOwnText = (el: Element) =>
    Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
    );

  const violations: {
    html: string;
    text: string;
    color: string;
    background: string;
    ratio: number;
    required: number;
    fontSize: string;
    fontWeight: string;
  }[] = [];
  let checked = 0;
  const skipped = { invisible: 0, disabled: 0, unmeasurable: 0 };

  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (!hasOwnText(el)) continue;

    const cs = getComputedStyle(el);
    const rects = el.getClientRects();
    // sr-only は 1x1 に潰して clip されている。見えない文字は対象外。
    const visible =
      rects.length > 0 &&
      Array.from(rects).some((r) => r.width >= 2 && r.height >= 2) &&
      cs.visibility === 'visible';
    if (!visible) {
      skipped.invisible += 1;
      continue;
    }

    // 無効な UI 部品は SC 1.4.3 の対象外。
    if (el.closest('[disabled], [aria-disabled="true"], fieldset:disabled')) {
      skipped.disabled += 1;
      continue;
    }

    const opacity = effectiveOpacity(el);
    if (opacity === 0) {
      skipped.invisible += 1;
      continue;
    }

    const { layers, unmeasurable } = backgroundLayers(el);
    if (unmeasurable) {
      skipped.unmeasurable += 1;
      continue;
    }

    const bg = composite(layers);
    const fg = composite([...layers, withAlpha(cs.color, opacity)]);
    const r = ratio(lum(fg), lum(bg));

    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    // WCAG の「大きな文字」: 24px 以上、または 18.66px 以上の太字。
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;

    checked += 1;
    if (r < required) {
      violations.push({
        html: el.outerHTML.slice(0, 140),
        text: (el.textContent ?? '').trim().slice(0, 40),
        color: cs.color,
        background: `rgb(${bg.join(', ')})`,
        ratio: Math.round(r * 100) / 100,
        required,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
      });
    }
  }

  return { checked, skipped, violations: violations.slice(0, limit) };
}

async function gotoWithTheme(page: Page, path: string, theme: 'light' | 'dark') {
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  // **トランジションを止めてから切り替える。** shadcn のテーブル行などは
  // `transition-colors` を持ち、テーマを切り替えた直後の getComputedStyle は
  // **遷移途中の中間色**を返す。切替前の色と切替後の背景を突き合わせることに
  // なり、実際には起きない組み合わせを違反として報告してしまう。
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });

  // next-themes は `light` / `dark` を付け替える。`dark` を足すだけだと
  // 両方付いた、実際には起きない状態になる。
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('light', t === 'light');
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

/**
 * 実テキストの走査。
 *
 * トークン単位の検査（上の「補助テキスト」）は、そのトークンが実際に
 * どの背景の上に置かれているかを見ていない。ここは**描かれている組み合わせ**を
 * そのまま測る。
 *
 * ページは `a11y-axe.spec.ts` と揃えてある。**ダイアログも開く** —
 * フォームは全てダイアログ / シートの中にあり、静的ページだけ見ても
 * 1つも検査していないことになるため。
 */
const TEXT_PAGES = [
  '/dashboard',
  '/employees',
  '/departments',
  '/skills',
  '/one-on-ones',
  '/evaluations',
  '/audit-logs',
  '/settings',
  '/settings/members',
  '/ai-assistant',
];

/**
 * 空状態のときは CTA のラベルが変わる（「スキルを追加」→「最初のスキルを追加」）。
 * e2e 用組織はシードデータを持たないため、両方に対応する必要がある。
 */
async function openDialog(page: Page, primary: string, empty: string) {
  const button = page.getByRole('button', { name: primary, exact: true });
  if ((await button.count()) > 0) {
    await button.first().click();
    return;
  }
  await page.getByRole('button', { name: empty, exact: true }).first().click();
}

const TEXT_DIALOGS = [
  { path: '/skills', primary: 'スキルを追加', empty: '最初のスキルを追加', title: 'スキルを追加' },
  { path: '/departments', primary: '部署を追加', empty: '部署を追加', title: '部署を追加' },
  { path: '/one-on-ones', primary: '1on1を記録', empty: '最初の1on1を記録', title: '1on1を記録' },
  {
    path: '/evaluations',
    primary: '評価サイクルを作成',
    empty: '最初の評価サイクルを作成',
    title: '評価サイクルを作成',
  },
  { path: '/settings/members', primary: '招待', empty: '招待', title: 'メンバーを招待' },
];

/** 失敗時に原因が読めるように、違反の中身をそのまま並べる。 */
function formatTextViolations(result: ReturnType<typeof textContrastProbe>): string {
  return result.violations
    .map(
      (v) =>
        `  「${v.text}」 ${v.ratio}:1 < ${v.required}:1\n` +
        `    color=${v.color} bg=${v.background} ${v.fontSize}/${v.fontWeight}\n` +
        `    ${v.html}`,
    )
    .join('\n');
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} テーマ / 実テキスト`, () => {
    for (const path of TEXT_PAGES) {
      test(`${path} のテキストがコントラスト基準を満たす`, async ({ page }) => {
        await gotoWithTheme(page, path, theme);

        const result = await page.evaluate(textContrastProbe, 10);

        // 「1つも測れていないのに緑」を防ぐ。セレクタや描画が壊れたら気付ける。
        expect(result.checked, `${path} でテキストを1つも測れていない`).toBeGreaterThan(5);
        expect(result.violations, formatTextViolations(result)).toEqual([]);
      });
    }

    for (const d of TEXT_DIALOGS) {
      test(`${d.title} ダイアログのテキストがコントラスト基準を満たす`, async ({ page }) => {
        await gotoWithTheme(page, d.path, theme);
        await openDialog(page, d.primary, d.empty);
        await expect(page.getByRole('dialog')).toBeVisible();

        const result = await page.evaluate(textContrastProbe, 10);

        expect(result.checked).toBeGreaterThan(5);
        expect(result.violations, formatTextViolations(result)).toEqual([]);
      });
    }
  });
}
