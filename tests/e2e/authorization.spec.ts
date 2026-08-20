import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { AUTH_FILES, FIXTURES_FILE, MARKERS, type Fixtures } from './authorization-fixtures';

/**
 * ロール別の認可が「画面まで」効いているかを検証する。
 *
 * Service Layer のユニットテストは値がマスクされることを保証するが、
 * その値が実際に画面へ渡っていないことまでは示せない。ここでは
 * member / viewer のセッションで実画面を開き、機微な値がページの
 * どこにも現れないことを見る。
 *
 * 各ケースには **owner での対照**を付けている。これが無いと、
 * データが存在しないだけで「見えない」が成立してしまい、
 * テストが素通りしていることに気付けない。
 */

const fixtures = (): Fixtures => JSON.parse(readFileSync(FIXTURES_FILE, 'utf-8'));

/** ページ全体のテキストに含まれるか。セレクタに依存せずマスク漏れを見る。 */
async function bodyText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()) ?? '';
}

async function openCycleDetail(page: Page): Promise<void> {
  await page.goto('/evaluations');
  await page.getByText(MARKERS.cycleName).first().click();
  await expect(page.getByRole('heading', { name: MARKERS.cycleName })).toBeVisible();
}

test.describe('owner — 対照群', () => {
  test.use({ storageState: AUTH_FILES.owner });

  test('他人の生年月日が見える', async ({ page }) => {
    await page.goto(`/employees/${fixtures().othersEmployeeId}`);
    await expect(page.getByText(MARKERS.othersBirthDate)).toBeVisible();
  });

  test('他人が書いた評価コメントが見える', async ({ page }) => {
    await openCycleDetail(page);
    expect(await bodyText(page)).toContain(MARKERS.othersComment);
  });

  test('自分が当事者でない1on1が見える', async ({ page }) => {
    await page.goto('/one-on-ones');
    expect(await bodyText(page)).toContain(MARKERS.othersNotes);
  });
});

test.describe('member — 他人の個人情報', () => {
  test.use({ storageState: AUTH_FILES.member });

  test('他人の生年月日は表示されない', async ({ page }) => {
    await page.goto(`/employees/${fixtures().othersEmployeeId}`);
    // 画面自体は開ける（従業員の read は全ロールに開いている）
    await expect(page.getByRole('tab', { name: '基本情報' })).toBeVisible();
    expect(await bodyText(page)).not.toContain(MARKERS.othersBirthDate);
  });

  test('自分の生年月日は表示される', async ({ page }) => {
    await page.goto(`/employees/${fixtures().selfEmployeeId}`);
    await expect(page.getByText(MARKERS.selfBirthDate)).toBeVisible();
  });
});

test.describe('member — 評価コメント', () => {
  test.use({ storageState: AUTH_FILES.member });

  test('他人が書いた評価のコメントは表示されない', async ({ page }) => {
    await openCycleDetail(page);
    expect(await bodyText(page)).not.toContain(MARKERS.othersComment);
  });

  test('自分が評価者の評価のコメントは表示される', async ({ page }) => {
    await openCycleDetail(page);
    expect(await bodyText(page)).toContain(MARKERS.selfComment);
  });
});

test.describe('member — 1on1の閲覧範囲', () => {
  test.use({ storageState: AUTH_FILES.member });

  test('自分が当事者でない1on1は一覧に出ない', async ({ page }) => {
    await page.goto('/one-on-ones');
    await page.waitForLoadState('networkidle');
    expect(await bodyText(page)).not.toContain(MARKERS.othersNotes);
  });

  test('自分が当事者の1on1は一覧に出る', async ({ page }) => {
    await page.goto('/one-on-ones');
    await page.waitForLoadState('networkidle');
    expect(await bodyText(page)).toContain(MARKERS.selfNotes);
  });
});

test.describe('viewer — 従業員レコードに紐付いていない場合', () => {
  test.use({ storageState: AUTH_FILES.viewer });

  /**
   * viewer は従業員レコードと紐付いていない。この場合の判定は
   * 「チェック不要」ではなく「何も見えない」に倒す設計になっている。
   * ここが緩むと、紐付け前のユーザーに全社の記録が開く。
   */
  test('どの1on1も一覧に出ない', async ({ page }) => {
    await page.goto('/one-on-ones');
    await page.waitForLoadState('networkidle');
    const text = await bodyText(page);
    expect(text).not.toContain(MARKERS.othersNotes);
    expect(text).not.toContain(MARKERS.selfNotes);
  });

  test('どの評価コメントも表示されない', async ({ page }) => {
    await openCycleDetail(page);
    const text = await bodyText(page);
    expect(text).not.toContain(MARKERS.othersComment);
    expect(text).not.toContain(MARKERS.selfComment);
  });

  test('他人の生年月日は表示されない', async ({ page }) => {
    await page.goto(`/employees/${fixtures().othersEmployeeId}`);
    await expect(page.getByRole('tab', { name: '基本情報' })).toBeVisible();
    expect(await bodyText(page)).not.toContain(MARKERS.othersBirthDate);
  });
});
