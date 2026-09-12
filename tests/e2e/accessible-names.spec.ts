import { readFileSync } from 'node:fs';

import { test, expect } from '@playwright/test';

import { createInvitation, deleteInvitation } from './admin-api';
import { FIXTURES_FILE, type Fixtures } from './authorization-fixtures';

/**
 * アイコンだけのボタン・リンクに名前が無いと、読み上げでは「ボタン」としか
 * 案内されず、並んでいるときに区別できない。
 *
 * ユニットテストではコンポーネント単位でしか見られないうえ、テストを持たない
 * 画面（nuqs + debounce の一覧、Recharts、dnd-kit など）は素通りする。
 * ここでは実際に描画された DOM を横断で走査して、名前の無い操作要素を検出する。
 */

/** 支援技術が読む名前の近似。accname の完全実装ではなく、実務上効く範囲に絞る。 */
function findUnnamedControls() {
  const labelledBy = (el: Element) =>
    (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() || '')
      .join(' ')
      .trim();

  const accessibleName = (el: Element) =>
    (el.getAttribute('aria-label') || '').trim() ||
    labelledBy(el) ||
    (el.textContent || '').trim() ||
    (el.getAttribute('title') || '').trim() ||
    (el.querySelector('img[alt]')?.getAttribute('alt') || '').trim();

  const selector = 'button, a[href], [role="button"], [role="link"]';

  return [...document.querySelectorAll(selector)]
    .filter((el) => {
      // 非表示の要素は読み上げ対象にならない
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      return !accessibleName(el);
    })
    .map((el) => el.outerHTML.slice(0, 200));
}

const fixtures = (): Fixtures => JSON.parse(readFileSync(FIXTURES_FILE, 'utf-8'));

const PAGES = [
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

for (const path of PAGES) {
  test(`${path}: 名前の無いボタン・リンクが無い`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const unnamed = await page.evaluate(findUnnamedControls);

    expect(unnamed, `名前の無い操作要素:\n${unnamed.join('\n\n')}`).toEqual([]);
  });
}

/**
 * 従業員詳細は `PAGES` に入れられない（id が要る）ため別立てにする。
 *
 * **一覧だけ見て詳細を見ないと、画面の半分が素通りする。** アバター・タブ・
 * 操作ボタンと、この画面にしかない要素が多い。
 */
test('/employees/[id]: 名前の無いボタン・リンクが無い', async ({ page }) => {
  await page.goto(`/employees/${fixtures().othersEmployeeId}`);
  await page.waitForLoadState('networkidle');

  const unnamed = await page.evaluate(findUnnamedControls);

  expect(unnamed, `名前の無い操作要素:\n${unnamed.join('\n\n')}`).toEqual([]);
});

/**
 * 未認証で見えるページ。
 *
 * **訪問者が最初に見る画面が、どの横断検査にも入っていなかった。**
 * 既定の storageState は認証済みで、middleware が `/login` `/signup` を
 * ダッシュボードへ飛ばすため、認証済みのままでは走査できない。
 */
test.describe('未認証ページ', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ['/', '/login', '/signup', '/reset-password']) {
    test(`${path}: 名前の無いボタン・リンクが無い`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const unnamed = await page.evaluate(findUnnamedControls);

      expect(unnamed, `名前の無い操作要素:\n${unnamed.join('\n\n')}`).toEqual([]);
    });
  }
});

/**
 * どのページにも「今どこに居るか」を表す見出しが1つある。
 *
 * **見た目が見出しでも、マークアップが見出しでなければ支援技術には無い。**
 * shadcn の `CardTitle` は `<div>` なので、そのまま使うと見出しが0個になる。
 * 実際 `(auth)` の3ページがそうなっていた（WCAG 1.3.1）。
 *
 * axe では拾えない。`page-has-heading-one` は `best-practice` タグにあり、
 * このリポジトリは上流のルール追加で無関係な PR が落ちるのを避けるため
 * そのタグを入れていない。
 *
 * **文言が重複していないこと**も見る。見出しだけでページを判別できないと、
 * 見出しがある意味が薄れる（WCAG 2.4.6）。
 */
const level1Headings = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('h1, [role="heading"][aria-level="1"]')).map((el) =>
      (el.textContent ?? '').trim(),
    ),
  );

test.describe('見出し', () => {
  for (const path of PAGES) {
    test(`${path}: レベル1の見出しがちょうど1つある`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      expect(await level1Headings(page)).toHaveLength(1);
    });
  }

  test('/employees/[id]: レベル1の見出しがちょうど1つある', async ({ page }) => {
    await page.goto(`/employees/${fixtures().othersEmployeeId}`);
    await page.waitForLoadState('networkidle');

    expect(await level1Headings(page)).toHaveLength(1);
  });
});

test.describe('未認証ページの見出し', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const PUBLIC_PAGES = ['/', '/login', '/signup', '/reset-password'];

  for (const path of PUBLIC_PAGES) {
    test(`${path}: レベル1の見出しがちょうど1つある`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      expect(await level1Headings(page)).toHaveLength(1);
    });
  }

  test('未認証ページの見出しが互いに重複しない', async ({ page }) => {
    const texts: string[] = [];
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      texts.push((await level1Headings(page))[0]);
    }

    expect(new Set(texts).size, `見出しが重複している: ${texts.join(' / ')}`).toBe(texts.length);
  });
});

/** 既定タブ以外と、招待の受諾画面。どちらもこの画面固有の操作要素を持つ。 */
for (const tab of ['スキル', '1on1', '評価'] as const) {
  test(`/employees/[id]: ${tab}タブに名前の無いボタン・リンクが無い`, async ({ page }) => {
    await page.goto(`/employees/${fixtures().othersEmployeeId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');

    const unnamed = await page.evaluate(findUnnamedControls);

    expect(unnamed, `名前の無い操作要素:\n${unnamed.join('\n\n')}`).toEqual([]);
  });
}

test.describe('未認証のフォールバック画面の名前', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('404 画面に名前の無いボタン・リンクが無い', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.waitForLoadState('networkidle');

    const unnamed = await page.evaluate(findUnnamedControls);

    expect(unnamed, `名前の無い操作要素:\n${unnamed.join('\n\n')}`).toEqual([]);
  });

  test('有効な招待の受諾画面に名前の無いボタン・リンクが無い', async ({ page }) => {
    // 残すと他スペックのセレクタが曖昧になって落ちる。finally で必ず消す。
    const token = await createInvitation(fixtures().orgId);
    try {
      await page.goto(`/invite/${token}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#password')).toBeVisible();

      const unnamed = await page.evaluate(findUnnamedControls);

      expect(unnamed, `名前の無い操作要素:\n${unnamed.join('\n\n')}`).toEqual([]);
    } finally {
      await deleteInvitation(token);
    }
  });
});
