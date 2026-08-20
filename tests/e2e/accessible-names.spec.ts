import { test, expect } from '@playwright/test';

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
