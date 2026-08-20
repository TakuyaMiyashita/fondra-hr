import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { adminInsert, adminSelect, adminUpdate } from './admin-api';
import { FIXTURES_FILE, type Fixtures } from './authorization-fixtures';

/**
 * 一覧クライアントの URL 状態（nuqs）を実挙動で検証する。
 *
 * この画面は nuqs + useRouter + debounce 付き検索 + TanStack Query の
 * 組み合わせで動いており、コンポーネントテストでは「モックが実装より
 * 複雑になる」ため意図的に外してある（docs/testing.md）。
 * nuqs の本質は **操作した状態が URL に載り、リロードで復元されること**で、
 * これはモックでは検証しようがない。ここを e2e で拾う。
 *
 * 各ケースは「操作 → URL を検証 → リロード → 復元された中身を検証」の順で書く。
 * 一覧の中身をリロード後に見るのは、URL に載った状態がサーバー側の
 * 再描画にまで効いていることが本来見たい保証だからである。
 * （なお現状のクライアントは URL を変えても再取得を行わない。
 *   詳細は PR 本文を参照。ここでは URL とリロード復元までを担保する）
 *
 * 判定を既存データ量に依存させないため、専用の従業員を投入したうえで
 * `search=E2E-PAGE` で母集団を12件に固定してから件数を数える。
 * 他スペックが作る従業員は `E2E-<timestamp>` 形式なのでこの検索には
 * 掛からず、実行順序にも依存しない。
 */

const SEARCH_SCOPE = 'E2E-PAGE';
const SEED_COUNT = 12;
/** 12番だけ退職にしておく。ステータスフィルタの判定に使う。 */
const RETIRED_CODE = 'E2E-PAGE-12';

function code(n: number): string {
  return `${SEARCH_SCOPE}-${String(n).padStart(2, '0')}`;
}

/** 同じ組織を使い回すため「存在しなければ作る」で書く。 */
async function seedEmployees(orgId: string): Promise<void> {
  const existing = await adminSelect<{ employee_code: string }[]>(
    `employees?org_id=eq.${orgId}&employee_code=like.${SEARCH_SCOPE}-*&select=employee_code`,
  );
  const known = new Set(existing.map((r) => r.employee_code));

  const missing = [];
  for (let n = 1; n <= SEED_COUNT; n++) {
    if (known.has(code(n))) continue;
    missing.push({
      org_id: orgId,
      employee_code: code(n),
      full_name: `E2Eページ社員${String(n).padStart(2, '0')}`,
      status: code(n) === RETIRED_CODE ? 'retired' : 'active',
    });
  }
  if (missing.length > 0) await adminInsert('employees', missing);

  // 既に居るレコードも前提を揃え直す。別スペックが書き換えても影響を受けない。
  await adminUpdate(`employees?org_id=eq.${orgId}&employee_code=eq.${RETIRED_CODE}`, {
    status: 'retired',
  });
  await adminUpdate(
    `employees?org_id=eq.${orgId}&employee_code=like.${SEARCH_SCOPE}-*&employee_code=neq.${RETIRED_CODE}`,
    { status: 'active' },
  );
}

const rows = (page: Page) => page.locator('table tbody tr');
const firstCode = (page: Page) => rows(page).first().locator('td').first();
const searchBox = (page: Page) => page.getByPlaceholder('名前・社員番号で検索');
const nextPage = (page: Page) => page.locator('button:has(svg.lucide-chevron-right)');
const prevPage = (page: Page) => page.locator('button:has(svg.lucide-chevron-left)');

/**
 * ページャの「全 N 件中」から N を読む。
 * 組織全体の従業員数は他スペックの実行で増えるため、
 * 「絞り込み前は12件より多い」ことだけを見て実数には依存しない。
 */
async function totalCount(page: Page): Promise<number> {
  const text = await page.getByText(/^全 \d+ 件中/).innerText();
  return Number(/全 (\d+) 件中/.exec(text)![1]);
}

test.beforeAll(async () => {
  const fixtures = JSON.parse(readFileSync(FIXTURES_FILE, 'utf-8')) as Fixtures;
  await seedEmployees(fixtures.orgId);
});

test.describe('従業員一覧 — URL 状態（nuqs）', () => {
  test('検索語が URL に載り、リロードすると絞り込みごと復元される', async ({ page }) => {
    await page.goto('/employees');
    expect(await totalCount(page)).toBeGreaterThan(SEED_COUNT);

    // debounce 300ms のあとに URL が書き換わる。固定待機ではなく URL を待つ。
    await searchBox(page).fill(`${SEARCH_SCOPE}-1`);
    await page.waitForURL(/[?&]search=E2E-PAGE-1(&|$)/);

    await page.reload();
    await expect(searchBox(page)).toHaveValue(`${SEARCH_SCOPE}-1`);
    // E2E-PAGE-10 / -11 / -12 の3件だけが残る
    await expect(rows(page)).toHaveCount(3);
    expect(await totalCount(page)).toBe(3);
  });

  test('検索語を消すと URL からパラメータごと消える', async ({ page }) => {
    await page.goto(`/employees?search=${SEARCH_SCOPE}`);
    await expect(rows(page)).toHaveCount(SEED_COUNT);

    await searchBox(page).fill('');
    await page.waitForURL((url) => !url.searchParams.has('search'));

    await page.reload();
    await expect(searchBox(page)).toHaveValue('');
    expect(await totalCount(page)).toBeGreaterThan(SEED_COUNT);
  });

  test('列ヘッダーの並べ替えが URL に載り、リロードしても復元される', async ({ page }) => {
    await page.goto(`/employees?search=${SEARCH_SCOPE}`);
    await expect(rows(page)).toHaveCount(SEED_COUNT);

    await page.getByRole('button', { name: '社員番号' }).click();
    await page.waitForURL(/sort=employeeCode/);
    await expect(page).toHaveURL(/order=asc/);

    await page.reload();
    await expect(firstCode(page)).toHaveText(code(1));
  });

  test('もう一度ヘッダーを押すと降順になり、既定値の order は URL から落ちる', async ({ page }) => {
    await page.goto(`/employees?search=${SEARCH_SCOPE}&sort=employeeCode&order=asc`);
    await expect(rows(page)).toHaveCount(SEED_COUNT);
    await expect(firstCode(page)).toHaveText(code(1));

    await page.getByRole('button', { name: '社員番号' }).click();
    // order の既定値は desc。nuqs は既定値と同じ値をパラメータごと落とすため、
    // 降順は「order=desc が載る」ではなく「order が消える」形で表れる。
    await page.waitForURL((url) => !url.searchParams.has('order'));
    await expect(page).toHaveURL(/sort=employeeCode/);

    await page.reload();
    await expect(firstCode(page)).toHaveText(code(SEED_COUNT));
  });

  test('ステータスフィルタが URL に載り、リロードしても復元される', async ({ page }) => {
    await page.goto(`/employees?search=${SEARCH_SCOPE}`);
    await expect(rows(page)).toHaveCount(SEED_COUNT);

    await page.getByRole('combobox').filter({ hasText: '全て' }).click();
    await page.getByRole('option', { name: '退職' }).click();
    await page.waitForURL(/status=retired/);

    await page.reload();
    // 復元されるのは URL だけでなく、トリガーに出るラベルも含む
    await expect(page.getByRole('combobox').filter({ hasText: '退職' })).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(firstCode(page)).toHaveText(RETIRED_CODE);
  });

  test('検索とフィルタは互いを消さずに URL 上で併存する', async ({ page }) => {
    await page.goto(`/employees?search=${SEARCH_SCOPE}&status=active`);
    await expect(rows(page)).toHaveCount(SEED_COUNT - 1);

    await searchBox(page).fill(`${SEARCH_SCOPE}-0`);
    await page.waitForURL(/[?&]search=E2E-PAGE-0(&|$)/);
    await expect(page).toHaveURL(/status=active/);

    await page.reload();
    // E2E-PAGE-01..09 の9件。退職の12番は status=active 側で除かれたまま。
    await expect(rows(page)).toHaveCount(9);
    await expect(page.getByRole('combobox').filter({ hasText: '在籍' })).toBeVisible();
  });
});

test.describe('従業員一覧 — ページネーション', () => {
  /** 母集団12件を perPage=10 に固定すると、必ず2ページになる。 */
  const twoPages = `/employees?search=${SEARCH_SCOPE}&perPage=10&sort=employeeCode&order=asc`;

  test('2ページ目に進むと URL と件数表示が変わり、リロードしても保たれる', async ({ page }) => {
    await page.goto(twoPages);
    await expect(rows(page)).toHaveCount(10);
    await expect(firstCode(page)).toHaveText(code(1));
    await expect(page.getByText(/全 12 件中 1.10 件/)).toBeVisible();

    await nextPage(page).click();
    await page.waitForURL(/page=2/);
    await expect(page.getByText(/全 12 件中 11.12 件/)).toBeVisible();

    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await expect(firstCode(page)).toHaveText(code(11));
  });

  test('最終ページでは「次へ」が押せず、前に戻ると page が URL から消える', async ({ page }) => {
    await page.goto(`${twoPages}&page=2`);
    await expect(rows(page)).toHaveCount(2);
    await expect(nextPage(page)).toBeDisabled();

    await prevPage(page).click();
    // 既定値（1ページ目）に戻ると nuqs はパラメータ自体を落とす
    await page.waitForURL((url) => !url.searchParams.has('page'));

    await page.reload();
    await expect(rows(page)).toHaveCount(10);
    await expect(firstCode(page)).toHaveText(code(1));
    await expect(prevPage(page)).toBeDisabled();
  });

  test('2ページ目で表示件数を変えると1ページ目に戻る', async ({ page }) => {
    await page.goto(`${twoPages}&page=2`);
    await expect(rows(page)).toHaveCount(2);

    await page.getByRole('combobox').filter({ hasText: '10' }).click();
    await page.getByRole('option', { name: '50' }).click();

    await page.waitForURL((url) => !url.searchParams.has('page'));
    await expect(page).toHaveURL(/perPage=50/);

    await page.reload();
    await expect(rows(page)).toHaveCount(SEED_COUNT);
    await expect(firstCode(page)).toHaveText(code(1));
  });
});
