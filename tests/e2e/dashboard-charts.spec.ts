import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { adminInsert, adminSelect, ensureAuthUser, ensureMembership } from './admin-api';
import { E2E_PASSWORD, FIXTURES_FILE, type Fixtures } from './authorization-fixtures';

/**
 * ダッシュボードのチャートが実際に描画されているかを見る。
 *
 * Recharts は jsdom では実寸が 0 になり、ResponsiveContainer が
 * 中身を描かない。「描画されたか」はコンポーネントテストでは
 * 原理的に検証できないため e2e の担当としている（docs/testing.md）。
 *
 * 見るのは svg が出ていることだけではなく、**系列が0本でないこと**。
 * 空の svg でも要素の存在だけなら通ってしまうためである。
 *
 * 空状態との出し分けは、データを持たない別組織に owner でログインして
 * 対照群を取る。同じ組織では「データがある」と「データが無い」を
 * 同時に用意できず、片方だけでは判定が素通りしていても気付けない。
 */

const DASH_DEPT = 'E2Eダッシュボード部署';
const DASH_EMPLOYEE_CODE = 'E2E-DASH-01';
const DASH_SKILL = 'E2Eダッシュボードスキル';
const DASH_SKILL_CATEGORY = 'E2Eカテゴリ';

const EMPTY_ORG_EMAIL = 'e2e-empty@example.com';
const EMPTY_ORG_NAME = 'E2E空組織';
const EMPTY_ORG_SLUG = 'e2e-empty-org';

/** 3つのチャートそれぞれの「データがありません」表示。 */
const EMPTY_MESSAGES = [
  '部署データがありません',
  '従業員データがありません',
  'スキルデータがありません',
] as const;

const card = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: title });

/**
 * 3つのチャートすべてに系列が出るように前提を作る。
 * 同じ組織を使い回すため、すべて「存在しなければ作る」で書く。
 */
async function seedChartData(orgId: string): Promise<void> {
  const depts = await adminSelect<{ id: string }[]>(
    `departments?org_id=eq.${orgId}&name=eq.${encodeURIComponent(DASH_DEPT)}&select=id`,
  );
  const deptId =
    depts.length > 0
      ? depts[0].id
      : (await adminInsert<{ id: string }[]>('departments', { org_id: orgId, name: DASH_DEPT }))[0]
          .id;

  // 部署別人数の棒は「在籍かつその部署に所属」でしか立たない。
  const employees = await adminSelect<{ id: string }[]>(
    `employees?org_id=eq.${orgId}&employee_code=eq.${DASH_EMPLOYEE_CODE}&select=id`,
  );
  const employeeId =
    employees.length > 0
      ? employees[0].id
      : (
          await adminInsert<{ id: string }[]>('employees', {
            org_id: orgId,
            employee_code: DASH_EMPLOYEE_CODE,
            full_name: 'E2Eダッシュボード社員',
            status: 'active',
            department_id: deptId,
          })
        )[0].id;

  const skills = await adminSelect<{ id: string }[]>(
    `skills?org_id=eq.${orgId}&name=eq.${encodeURIComponent(DASH_SKILL)}&select=id`,
  );
  const skillId =
    skills.length > 0
      ? skills[0].id
      : (
          await adminInsert<{ id: string }[]>('skills', {
            org_id: orgId,
            name: DASH_SKILL,
            category: DASH_SKILL_CATEGORY,
          })
        )[0].id;

  // スキルカテゴリ分布は skills ではなく employee_skills を数える。
  const assigned = await adminSelect<unknown[]>(
    `employee_skills?employee_id=eq.${employeeId}&skill_id=eq.${skillId}&select=id`,
  );
  if (assigned.length === 0) {
    await adminInsert('employee_skills', {
      org_id: orgId,
      employee_id: employeeId,
      skill_id: skillId,
      level: 3,
    });
  }
}

/** データを一切持たない対照群の組織を用意する。 */
async function seedEmptyOrg(): Promise<void> {
  const userId = await ensureAuthUser(EMPTY_ORG_EMAIL, E2E_PASSWORD);
  const orgs = await adminSelect<{ id: string }[]>(
    `organizations?slug=eq.${EMPTY_ORG_SLUG}&select=id`,
  );
  const orgId =
    orgs.length > 0
      ? orgs[0].id
      : (
          await adminInsert<{ id: string }[]>('organizations', {
            name: EMPTY_ORG_NAME,
            slug: EMPTY_ORG_SLUG,
          })
        )[0].id;
  await ensureMembership(userId, orgId, 'owner');
}

test.beforeAll(async () => {
  const fixtures = JSON.parse(readFileSync(FIXTURES_FILE, 'utf-8')) as Fixtures;
  await seedChartData(fixtures.orgId);
  await seedEmptyOrg();
});

test.describe('ダッシュボードのチャート — データがある組織', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
  });

  test('部署別人数は棒グラフを描画し、棒が1本以上ある', async ({ page }) => {
    const chart = card(page, '部署別人数');
    await expect(chart.locator('svg.recharts-surface')).toHaveCount(1);
    // 系列が0本の svg でも「存在する」だけなら通ってしまうため本数を見る
    await expect(chart.locator('.recharts-bar-rectangle')).not.toHaveCount(0);
    // 描画されているのが投入した実データであることまで見る
    await expect(chart.locator(`path[name="${DASH_DEPT}"]`)).toHaveCount(1);
    await expect(chart.getByText('部署データがありません')).toHaveCount(0);
  });

  test('従業員ステータスは円グラフを描画し、扇形が1つ以上ある', async ({ page }) => {
    const chart = card(page, '従業員ステータス');
    await expect(chart.locator('svg.recharts-surface')).toHaveCount(1);
    await expect(chart.locator('.recharts-pie-sector')).not.toHaveCount(0);
    // 在籍の従業員を投入しているので、ラベルにも必ず現れる
    await expect(chart.getByText(/在籍 \(\d+\)/)).toBeVisible();
    await expect(chart.getByText('従業員データがありません')).toHaveCount(0);
  });

  test('スキルカテゴリ分布は円グラフを描画し、投入したカテゴリがラベルに出る', async ({ page }) => {
    const chart = card(page, 'スキルカテゴリ分布');
    await expect(chart.locator('svg.recharts-surface')).toHaveCount(1);
    await expect(chart.locator('.recharts-pie-sector')).not.toHaveCount(0);
    await expect(chart.getByText(new RegExp(DASH_SKILL_CATEGORY))).toBeVisible();
    await expect(chart.getByText('スキルデータがありません')).toHaveCount(0);
  });
});

test.describe('ダッシュボードのチャート — データが無い組織（対照群）', () => {
  // 既定の storageState（owner）は E2E テスト組織のものなので使わない。
  test.use({ storageState: { cookies: [], origins: [] } });

  test('3つのチャートすべてが空状態になり、svg は描画されない', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(EMPTY_ORG_EMAIL);
    await page.locator('#password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('**/employees', { timeout: 15_000 });

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

    for (const message of EMPTY_MESSAGES) {
      await expect(page.getByText(message)).toBeVisible();
    }
    await expect(page.locator('svg.recharts-surface')).toHaveCount(0);
  });
});
