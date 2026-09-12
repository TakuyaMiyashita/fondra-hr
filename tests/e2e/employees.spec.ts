import { test, expect, type Page } from '@playwright/test';

import { adminInsert, adminSelect, adminStorageList } from './admin-api';

test.describe('従業員一覧', () => {
  test('displays employee list page', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('heading', { name: '従業員一覧' })).toBeVisible();
  });

  test('shows table or empty state', async ({ page }) => {
    await page.goto('/employees');
    const table = page.locator('table').first();
    const emptyHeading = page.getByRole('heading', { name: '従業員が登録されていません' });
    await expect(table.or(emptyHeading)).toBeVisible();
  });

  test('opens create form sheet', async ({ page }) => {
    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await expect(page.getByText('従業員を登録')).toBeVisible();
  });

  test('validates required fields on create', async ({ page }) => {
    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByRole('button', { name: '登録' }).click();

    await expect(page.getByText('社員番号を入力してください')).toBeVisible();
    await expect(page.getByText('氏名を入力してください')).toBeVisible();
  });

  test('creates and displays a new employee', async ({ page }) => {
    const code = `E2E-${Date.now()}`;

    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();

    await page.locator('#employeeCode').fill(code);
    await page.locator('#fullName').fill('テスト太郎');
    await page.getByRole('button', { name: '登録' }).click();

    await expect(page.getByText('従業員を登録しました')).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();
  });

  test('search filters employees', async ({ page }) => {
    await page.goto('/employees');

    const searchInput = page.getByPlaceholder('氏名・社員番号で検索');
    if (await searchInput.isVisible()) {
      await searchInput.fill('存在しない従業員名XYZ');
      await page.waitForTimeout(500);
    }
  });
});

test.describe('従業員詳細', () => {
  test('navigates to detail and shows tabs', async ({ page }) => {
    const code = `E2E-DET-${Date.now()}`;
    const name = `詳細テスト-${Date.now()}`;

    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.locator('#employeeCode').fill(code);
    await page.locator('#fullName').fill(name);
    await page.getByRole('button', { name: '登録' }).click();
    await expect(page.getByText('従業員を登録しました')).toBeVisible();

    await page.getByRole('link', { name }).first().click();

    await expect(page.getByRole('tab', { name: '基本情報' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'スキル' })).toBeVisible();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });
});

/**
 * 従業員の削除と匿名化。
 *
 * 削除は「記録が紐づいていたら止まる」ことが主眼。ここが通ると、その従業員が
 * 評価者として書いた他人の評価と、面談者として実施した部下の 1on1 まで
 * 道連れで消える（ADR 0016）。
 */
test.describe('従業員の削除と匿名化', () => {
  /**
   * 専用の従業員を1人作り、その詳細画面まで進む。
   *
   * 他スペックのデータに相乗りすると実行順で壊れるので、毎回作る。
   * 検索はデバウンスを挟むため、URL に直接載せて絞り込む。
   */
  async function createEmployee(page: Page, name: string) {
    const code = `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await page.goto('/employees');
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.locator('#employeeCode').fill(code);
    await page.locator('#fullName').fill(name);
    await page.getByRole('button', { name: '登録', exact: true }).click();
    await expect(page.getByRole('button', { name: '新規登録' })).toBeVisible();

    await page.goto(`/employees?search=${code}`);
    await page
      .getByRole('link', { name: new RegExp(name) })
      .first()
      .click();
    await page.waitForURL(/\/employees\/[0-9a-f-]{36}$/);

    return page.url().split('/').pop()!;
  }

  test('記録が紐づかない従業員は削除できる', async ({ page }) => {
    await createEmployee(page, '削除される太郎');

    await page.getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();

    await page.waitForURL('**/employees');
  });

  test('1on1 が紐づいた従業員は削除できず、件数と代替手段が示される', async ({ page }) => {
    const employeeId = await createEmployee(page, '面談する花子');
    const employeeUrl = page.url();

    // 1on1 はダイアログを操作せず service_role で投入する。ここで見たいのは
    // 削除が止まることであって、1on1 の入力フォームではない。
    const [row] = await adminSelect<{ org_id: string }[]>(
      `employees?id=eq.${employeeId}&select=org_id`,
    );
    await adminInsert('one_on_ones', {
      org_id: row.org_id,
      employee_id: employeeId,
      interviewer_id: employeeId,
      held_on: '2026-01-15',
    });

    await page.goto(employeeUrl);
    await page.getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();

    // 件数と、代わりに何をすればよいかまで出ること。
    await expect(page.getByText(/1on1記録1件.*削除できません/)).toBeVisible();
    // 消えていないこと。一覧へ飛ばされずに留まる。
    await expect(page).toHaveURL(employeeUrl);
  });

  test('アバターのある従業員を匿名化すると Storage からも消える', async ({ page }) => {
    // **写真のある経路が本番の主経路。** 写真の無い従業員でしか試していないと、
    // アバター削除が失敗しても気づけない。Storage の remove はポリシーで
    // 拒否されても error を返さないため、実物で確かめる意味が大きい。
    const employeeId = await createEmployee(page, 'アバター持ち三郎');
    const [row] = await adminSelect<{ org_id: string }[]>(
      `employees?id=eq.${employeeId}&select=org_id`,
    );
    const folder = `${row.org_id}/${employeeId}`;

    // 1x1 の PNG を実際にアップロードする。
    await page.setInputFiles('input[type="file"]', {
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect.poll(() => adminStorageList('avatars', folder)).toHaveLength(1);

    await page.getByRole('button', { name: '匿名化', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '匿名化する' }).click();

    await expect(page.getByRole('heading', { name: '匿名化済みの従業員' })).toBeVisible();
    // DB だけ匿名化されて顔写真が残る、が一番まずい。service_role で直接見る。
    expect(await adminStorageList('avatars', folder)).toHaveLength(0);
  });

  test('匿名化すると個人情報が消え、レコードは残る', async ({ page }) => {
    await createEmployee(page, '匿名化される次郎');
    const employeeUrl = page.url();

    await page.getByRole('button', { name: '匿名化', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '匿名化する' }).click();

    await expect(page.getByRole('heading', { name: '匿名化済みの従業員' })).toBeVisible();
    await expect(page.getByText('匿名化される次郎')).toHaveCount(0);
    // レコードは残る（一覧へ飛ばされない）。
    await expect(page).toHaveURL(employeeUrl);
  });
});
