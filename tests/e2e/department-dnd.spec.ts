import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { adminInsert, adminSelect, adminUpdate } from './admin-api';
import { FIXTURES_FILE, type Fixtures } from './authorization-fixtures';

/**
 * 組織図のドラッグ&ドロップ（dnd-kit）を実挙動で検証する。
 *
 * dnd-kit は PointerSensor 経由でポインタイベントの並びを見ており、
 * jsdom では発火させられない。コンポーネントテストから外している
 * ぶんをここで拾う（docs/testing.md）。
 *
 * 一番ありがちな回帰は「画面上は動いたが DB に入っていない」なので、
 * 移動のたびに**リロードして永続化まで**確認する。
 *
 * Playwright の `dragTo()` は HTML5 の drag イベントを送るだけで
 * dnd-kit は反応しない。`page.mouse` で down / move / up を組み立て、
 * activationConstraint（distance: 8）を超えるところまで動かす。
 */

const PARENT = 'E2E-DND-A';
const CHILD = 'E2E-DND-B';

/** ルート階層のインデント（depth 0 → 8px）。 */
const ROOT_INDENT = '8px';
/** 子階層のインデント（depth 1 → 1 * 24 + 8）。 */
const CHILD_INDENT = '32px';

/** 部署行。子行は親行の外側 div に入るので、行同士は入れ子にならない。 */
const row = (page: Page, name: string): Locator =>
  page.locator('div[style*="padding-left"]').filter({ hasText: name });

/** 行の先頭にあるドラッグハンドル（GripVertical）。 */
const grip = (page: Page, name: string): Locator => row(page, name).locator('button').first();

/** 開閉トグル（ChevronRight）。ハンドルの次のボタン。 */
const toggle = (page: Page, name: string): Locator => row(page, name).locator('button').nth(1);

const rootDropZone = (page: Page): Locator => page.getByText('ここにドロップでルート部署に移動');

async function ensureRootDepartment(orgId: string, name: string): Promise<void> {
  const existing = await adminSelect<{ id: string }[]>(
    `departments?org_id=eq.${orgId}&name=eq.${encodeURIComponent(name)}&select=id`,
  );
  if (existing.length === 0) {
    await adminInsert('departments', { org_id: orgId, name, parent_id: null });
    return;
  }
  // 前回の実行結果を持ち越さない。テスト間の実行順序に依存させないため、
  // 毎回ルート直下に戻してから始める。
  await adminUpdate(`departments?id=eq.${existing[0].id}`, { parent_id: null });
}

let orgId: string;

test.beforeAll(() => {
  orgId = (JSON.parse(readFileSync(FIXTURES_FILE, 'utf-8')) as Fixtures).orgId;
});

test.beforeEach(async () => {
  await ensureRootDepartment(orgId, PARENT);
  await ensureRootDepartment(orgId, CHILD);
});

/**
 * dnd-kit にドラッグと認識させる。
 * 目標位置へ一度で飛ばすと over が確定しないことがあるため、
 * 途中経過を刻んだうえで最後に同じ座標へもう一度動かす。
 *
 * 掴めていない（= 何も起きない）まま素通りするのを防ぐため、
 * ドロップ前に dnd-kit が isDragging になっていることを確かめる。
 * これが無いと「移動しない」系のケースが常に通ってしまう。
 */
async function dragOnto(page: Page, name: string, target: Locator): Promise<void> {
  const source = grip(page, name);
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('ドラッグ元/先が画面に出ていない');

  const fromX = from.x + from.width / 2;
  const fromY = from.y + from.height / 2;
  const toX = to.x + to.width / 2;
  const toY = to.y + to.height / 2;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // activationConstraint の distance: 8 を超えるまでは掴んだ扱いにならない
  await page.mouse.move(fromX, fromY + 12, { steps: 5 });
  await expect(row(page, name)).toHaveClass(/opacity-50/);
  await page.mouse.move(toX, toY, { steps: 20 });
  await page.mouse.move(toX, toY, { steps: 2 });
  await page.mouse.up();
}

test.describe('組織図のドラッグ&ドロップ', () => {
  // 部署は他スペックの実行ぶんが積み上がる。ドラッグ元とルートのドロップ先が
  // 同時に画面へ収まるよう、この spec だけ縦に広い viewport を使う。
  test.use({ viewport: { width: 1280, height: 2000 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/departments');
    await expect(page.getByRole('heading', { name: '組織図' })).toBeVisible();
    await expect(row(page, PARENT)).toHaveCSS('padding-left', ROOT_INDENT);
    await expect(row(page, CHILD)).toHaveCSS('padding-left', ROOT_INDENT);
  });

  test('部署を別の部署にドロップすると子部署になり、リロード後も維持される', async ({ page }) => {
    await dragOnto(page, CHILD, row(page, PARENT));
    await expect(page.getByText('部署を移動しました')).toBeVisible();

    // 画面上動いただけで DB に入っていない、が一番ありがちな回帰
    await page.reload();
    await expect(row(page, CHILD)).toHaveCSS('padding-left', CHILD_INDENT);

    // インデントだけでなく木構造として親に属していることを見る。
    // 親を畳めば子は消え、開けば戻る。
    await toggle(page, PARENT).click();
    await expect(row(page, CHILD)).toBeHidden();
    await toggle(page, PARENT).click();
    await expect(row(page, CHILD)).toBeVisible();
  });

  test('子部署をルートのドロップ領域に戻すと、リロード後もルート直下になる', async ({ page }) => {
    await dragOnto(page, CHILD, row(page, PARENT));
    await expect(page.getByText('部署を移動しました')).toBeVisible();
    await page.reload();
    await expect(row(page, CHILD)).toHaveCSS('padding-left', CHILD_INDENT);

    await dragOnto(page, CHILD, rootDropZone(page));
    await expect(page.getByText('部署を移動しました')).toBeVisible();

    await page.reload();
    await expect(row(page, CHILD)).toHaveCSS('padding-left', ROOT_INDENT);
    // 親側の開閉トグルも子が居なくなったぶん消える（invisible クラスが付く）
    await expect(toggle(page, PARENT)).toHaveClass(/invisible/);
  });

  test('自分自身にドロップしても移動は起きない', async ({ page }) => {
    await dragOnto(page, CHILD, row(page, CHILD));

    // 同じ親のままなので Server Action は呼ばれず、トーストも出ない
    await expect(page.getByText('部署を移動しました')).toHaveCount(0);
    await page.reload();
    await expect(row(page, CHILD)).toHaveCSS('padding-left', ROOT_INDENT);
  });

  test('親を自分の子孫にドロップしても循環にはならない', async ({ page }) => {
    await dragOnto(page, CHILD, row(page, PARENT));
    await expect(page.getByText('部署を移動しました')).toBeVisible();
    await page.reload();
    await expect(row(page, CHILD)).toHaveCSS('padding-left', CHILD_INDENT);

    // 親を子の下に入れようとする操作。クライアント側で弾かれる。
    await dragOnto(page, PARENT, row(page, CHILD));
    await expect(page.getByText('部署を移動しました')).toHaveCount(0);

    await page.reload();
    await expect(row(page, PARENT)).toHaveCSS('padding-left', ROOT_INDENT);
    await expect(row(page, CHILD)).toHaveCSS('padding-left', CHILD_INDENT);
  });
});
