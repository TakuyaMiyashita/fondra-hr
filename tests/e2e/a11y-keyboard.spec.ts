import { test, expect } from '@playwright/test';

import { MARKERS } from './authorization-fixtures';

/**
 * キーボードだけで到達・操作できるかの検証。
 *
 * 見た目では気付けない類の欠陥を対象にする。`<div onClick>` はマウスでは
 * 動くので画面を触っている限り正常に見えるが、Tab で辿り着けず Enter でも
 * 反応しない。ユニットテストも「onClick を呼べば動く」ことしか見ないので
 * 素通りする。
 */

test.describe('評価サイクルカード', () => {
  /**
   * 以前は <Card onClick> で、div にハンドラを付けただけだった。
   * role も tabIndex も onKeyDown も無く、キーボードからは詳細に入れなかった。
   */
  test('サイクル名にキーボードで到達し、Enter で詳細を開ける', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    const cards = page.locator('[data-slot="card"]');
    test.skip((await cards.count()) === 0, '評価サイクルが無い組織では検証できない');

    // カード内で最初にフォーカスできる要素がサイクル名のボタンであること
    const cycleButton = cards.first().getByRole('button').first();
    const name = (await cycleButton.textContent())?.trim() ?? '';

    await cycleButton.focus();
    await expect(cycleButton).toBeFocused();

    await page.keyboard.press('Enter');

    // 詳細ビューに切り替わり、サイクル名が見出しになる
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  /**
   * カード全体を覆う疑似要素より操作メニューが上に無いと、メニューを
   * クリックしただけで詳細に入ってしまう。以前は stopPropagation で
   * 抑えていたが、z-index で解決したので伝播を止める必要が無くなった。
   */
  test('操作メニューを開いても詳細に入らない', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('button', { name: / の操作$/ }).first();
    test.skip((await trigger.count()) === 0, '評価サイクルが無い組織では検証できない');

    await trigger.click();

    await expect(page.getByRole('menuitem', { name: '編集' })).toBeVisible();
  });
});

test.describe('トグルボタン群', () => {
  /**
   * 5項目 × 5段階のボタンは、名前を与えないと「1」〜「5」が25個並ぶだけで
   * どの項目の何点なのか読み上げで判別できない。
   */
  test('評価入力の各ボタンが項目名を含む名前を持つ', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // 「最初のカード」だと評価が0件のサイクルを引くことがある。
    // global-setup が評価を入れているサイクルを名指しする。
    await page.getByRole('button', { name: MARKERS.cycleName, exact: true }).click();
    await expect(page.getByRole('heading', { name: MARKERS.cycleName })).toBeVisible();

    await page
      .getByRole('button', { name: / の評価の操作$/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: '評価を入力' }).click();

    await expect(page.getByRole('heading', { name: '評価入力' })).toBeVisible();

    // グループ見出しと、項目名込みのボタン名
    await expect(page.getByRole('group', { name: '評価項目' })).toBeVisible();
    // 以前は5項目×5段階の25個すべてが「1」〜「5」という名前で、
    // どの項目の何点なのか読み上げでは判別できなかった
    for (const label of ['業績', '能力', '態度']) {
      await expect(page.getByRole('group', { name: label })).toBeVisible();
      await expect(page.getByRole('button', { name: `${label} 3`, exact: true })).toBeVisible();
    }
  });
});

test.describe('検索入力', () => {
  /**
   * placeholder は名前にならない。入力にフォーカスした瞬間に消えるうえ、
   * 支援技術は名前として扱わない実装が多い。
   */
  const CASES = [
    { path: '/employees', name: '名前・社員番号で検索' },
    { path: '/one-on-ones', name: '氏名で検索' },
    { path: '/skills', name: 'スキル名で検索' },
  ];

  for (const c of CASES) {
    test(`${c.path} の検索入力に名前がある`, async ({ page }) => {
      await page.goto(c.path);
      await expect(page.getByRole('textbox', { name: c.name })).toBeVisible();
    });
  }
});
