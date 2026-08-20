import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import type { Result } from 'axe-core';

/**
 * axe による横断検査。
 *
 * `accessible-names.spec.ts` が「名前があるか」だけを見るのに対し、
 * こちらはラベルの関連付け・aria の整合・重複 id といった標準ルールを見る。
 * 両方を残しているのは検出集合が違うためで、失敗時のメッセージは
 * 前者のほうが読みやすい（違反した HTML をそのまま出す）。
 *
 * **最大の目的はダイアログの中を見ること。** フォームは全てダイアログ /
 * シートの中にあり、`accessible-names.spec.ts` は開かないので未走査だった。
 */

/**
 * 今回の a11y スコープは「フォーム関連 + キーボード到達性」。
 * 配色は docs/adr/0009 で明示的にスコープ外としたので検査しない。
 * **除外を増やすときは、なぜ増やすのかをここに書くこと。**
 */
const DISABLED_RULES = [
  // 配色はスコープ外（ADR 0009）。フォーカスリングと Recharts の系列色が
  // まとめて落ちるため、有効にすると導入そのものができない。
  'color-contrast',
];

function axe(page: Page) {
  return (
    new AxeBuilder({ page })
      // best-practice / experimental は入れない。上流の axe-core 更新で
      // 新ルールが増え、無関係な PR が落ちるのを防ぐ。
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(DISABLED_RULES)
      // Recharts が描く svg は装飾。同じ数値は統計カードとテーブルで
      // 別に提供している。
      .exclude('.recharts-wrapper')
  );
}

/** axe 既定の出力は CI ログから原因が読めないので、要点だけ組み立てる。 */
function format(violations: Result[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => `    ${n.html.slice(0, 160)}\n      → ${n.failureSummary ?? ''}`)
        .join('\n');
      return `[${v.id}] ${v.help}\n${nodes}`;
    })
    .join('\n\n');
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
  test(`${path}: axe 違反が無い`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const { violations } = await axe(page).analyze();

    expect(violations, format(violations)).toEqual([]);
  });
}

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

const DIALOGS = [
  { path: '/skills', primary: 'スキルを追加', empty: '最初のスキルを追加', title: 'スキルを追加' },
  { path: '/departments', primary: '部署を追加', empty: '部署を追加', title: '部署を追加' },
  {
    path: '/one-on-ones',
    primary: '1on1を記録',
    empty: '最初の1on1を記録',
    title: '1on1を記録',
  },
  {
    path: '/evaluations',
    primary: '評価サイクルを作成',
    empty: '最初の評価サイクルを作成',
    title: '評価サイクルを作成',
  },
  {
    path: '/settings/members',
    primary: '招待',
    empty: '招待',
    title: 'メンバーを招待',
  },
];

for (const d of DIALOGS) {
  test(`${d.path}: ${d.title} ダイアログに axe 違反が無い`, async ({ page }) => {
    await page.goto(d.path);
    await page.waitForLoadState('networkidle');
    await openDialog(page, d.primary, d.empty);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 開いたダイアログだけを見る。背後のページは上のテストが見ている。
    const { violations } = await axe(page).include('[role="dialog"]').analyze();

    expect(violations, format(violations)).toEqual([]);
  });
}

/**
 * バリデーションエラー表示中の検査。
 *
 * `.tsx` はカバレッジ計測の対象外なので、FormField の配線
 * （aria-invalid / aria-describedby）が生きていることを実アプリで
 * 保証できるのはここだけになる。
 */
test('/skills: エラー表示中のダイアログに axe 違反が無い', async ({ page }) => {
  await page.goto('/skills');
  await page.waitForLoadState('networkidle');
  await openDialog(page, 'スキルを追加', '最初のスキルを追加');

  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByText('スキル名を入力してください')).toBeVisible();

  // 素の <p> を並べるだけでは付かない属性。FormField の成果そのもの。
  await expect(page.locator('#skill-name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#skill-name')).toHaveAttribute('aria-describedby', /.+/);

  const { violations } = await axe(page).include('[role="dialog"]').analyze();

  expect(violations, format(violations)).toEqual([]);
});
