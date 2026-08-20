import { test as setup, expect, type Page } from '@playwright/test';

import { adminInsert, adminSelect, ensureAuthUser, ensureMembership } from './admin-api';
import {
  AUTH_FILES,
  E2E_PASSWORD,
  FIXTURES_FILE,
  MARKERS,
  MEMBER_EMAIL,
  OWNER_EMAIL,
  VIEWER_EMAIL,
  type Fixtures,
} from './authorization-fixtures';

const TEST_ORG = 'E2Eテスト組織';

/**
 * e2e の前提を用意する。
 *
 * 単一の owner だけでログインしていると、ロール別の認可（生年月日のマスク、
 * 評価コメントのマスク、1on1 の当事者限定）が画面まで効いているかを
 * 一切検証できない。owner / member / viewer の3セッションと、
 * 「本人のもの」「他人のもの」を判別できる固定データを用意する。
 *
 * 判定用の値には E2E- で始まるマーカー文字列を使う。セレクタに依存せず
 * 「この文字列がページのどこにも出ていないこと」を検証できるため、
 * マスク漏れの検出に強い。
 */

async function ensureOrg(ownerId: string): Promise<string> {
  const memberships = await adminSelect<{ org_id: string }[]>(
    `memberships?user_id=eq.${ownerId}&select=org_id`,
  );
  if (memberships.length > 0) return memberships[0].org_id;

  const slug = `e2e-test-${Date.now().toString(36)}`;
  const orgs = await adminInsert<{ id: string }[]>('organizations', { name: TEST_ORG, slug });
  await ensureMembership(ownerId, orgs[0].id, 'owner');
  return orgs[0].id;
}

async function ensureEmployee(
  orgId: string,
  employee: Record<string, unknown> & { employee_code: string },
): Promise<string> {
  const existing = await adminSelect<{ id: string }[]>(
    `employees?org_id=eq.${orgId}&employee_code=eq.${employee.employee_code}&select=id`,
  );
  if (existing.length > 0) return existing[0].id;

  const rows = await adminInsert<{ id: string }[]>('employees', { org_id: orgId, ...employee });
  return rows[0].id;
}

/**
 * 認可の検証に使う固定データ。
 *
 * 同じ組織を使い回すため、すべて「存在しなければ作る」で書く。
 * 毎回作り直すと id が変わり、失敗時の調査がしづらくなる。
 */
async function seedFixtures(orgId: string, memberUserId: string): Promise<Fixtures> {
  // member 本人に紐付く従業員。user_id を入れないと本人判定が効かない。
  const selfEmployeeId = await ensureEmployee(orgId, {
    employee_code: 'E2E-SELF',
    full_name: 'E2E本人',
    email: MEMBER_EMAIL,
    birth_date: MARKERS.selfBirthDate,
    user_id: memberUserId,
    status: 'active',
  });

  const othersEmployeeId = await ensureEmployee(orgId, {
    employee_code: 'E2E-OTHER',
    full_name: 'E2E他人',
    email: 'e2e-other@example.com',
    birth_date: MARKERS.othersBirthDate,
    status: 'active',
  });

  const thirdEmployeeId = await ensureEmployee(orgId, {
    employee_code: 'E2E-OTHER2',
    full_name: 'E2E他人2',
    email: 'e2e-other2@example.com',
    status: 'active',
  });

  const existingOneOnOnes = await adminSelect<{ notes: string | null }[]>(
    `one_on_ones?org_id=eq.${orgId}&select=notes`,
  );
  const notes = existingOneOnOnes.map((r) => r.notes);

  if (!notes.includes(MARKERS.othersNotes)) {
    // 当事者に member を含まない記録。member からは一覧にも出てはならない。
    await adminInsert('one_on_ones', {
      org_id: orgId,
      employee_id: othersEmployeeId,
      interviewer_id: thirdEmployeeId,
      held_on: '2026-06-01',
      notes: MARKERS.othersNotes,
    });
  }
  if (!notes.includes(MARKERS.selfNotes)) {
    await adminInsert('one_on_ones', {
      org_id: orgId,
      employee_id: selfEmployeeId,
      interviewer_id: othersEmployeeId,
      held_on: '2026-06-02',
      notes: MARKERS.selfNotes,
    });
  }

  const cycles = await adminSelect<{ id: string }[]>(
    `evaluation_cycles?org_id=eq.${orgId}&name=eq.${encodeURIComponent(MARKERS.cycleName)}&select=id`,
  );
  const cycleId =
    cycles.length > 0
      ? cycles[0].id
      : (
          await adminInsert<{ id: string }[]>('evaluation_cycles', {
            org_id: orgId,
            name: MARKERS.cycleName,
            period_start: '2026-04-01',
            period_end: '2026-09-30',
            status: 'in_progress',
          })
        )[0].id;

  const existingEvals = await adminSelect<{ comment: string | null }[]>(
    `evaluations?cycle_id=eq.${cycleId}&select=comment`,
  );
  const comments = existingEvals.map((r) => r.comment);

  if (!comments.includes(MARKERS.othersComment)) {
    // 評価者が member でない評価。コメントは member から見えてはならない。
    await adminInsert('evaluations', {
      org_id: orgId,
      cycle_id: cycleId,
      employee_id: othersEmployeeId,
      evaluator_id: thirdEmployeeId,
      comment: MARKERS.othersComment,
    });
  }
  if (!comments.includes(MARKERS.selfComment)) {
    await adminInsert('evaluations', {
      org_id: orgId,
      cycle_id: cycleId,
      employee_id: othersEmployeeId,
      evaluator_id: selfEmployeeId,
      comment: MARKERS.selfComment,
    });
  }

  // 被評価者が member 本人の評価。確定後だけ本人に開示される規則の検証用に、
  // 確定済みと未確定の両方を置く。
  if (!comments.includes(MARKERS.confirmedComment)) {
    await adminInsert('evaluations', {
      org_id: orgId,
      cycle_id: cycleId,
      employee_id: selfEmployeeId,
      evaluator_id: othersEmployeeId,
      comment: MARKERS.confirmedComment,
      status: 'confirmed',
    });
  }
  if (!comments.includes(MARKERS.unconfirmedComment)) {
    await adminInsert('evaluations', {
      org_id: orgId,
      cycle_id: cycleId,
      employee_id: selfEmployeeId,
      evaluator_id: thirdEmployeeId,
      comment: MARKERS.unconfirmedComment,
      status: 'submitted',
    });
  }

  return { orgId, selfEmployeeId, othersEmployeeId };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();

  await page.waitForURL('**/employees', { timeout: 15_000 });
  await expect(page.locator('body')).toBeVisible();
}

setup('authenticate', async ({ page, browser }) => {
  const ownerId = await ensureAuthUser(OWNER_EMAIL, E2E_PASSWORD);
  const orgId = await ensureOrg(ownerId);

  const memberId = await ensureAuthUser(MEMBER_EMAIL, E2E_PASSWORD);
  await ensureMembership(memberId, orgId, 'member');

  const viewerId = await ensureAuthUser(VIEWER_EMAIL, E2E_PASSWORD);
  await ensureMembership(viewerId, orgId, 'viewer');

  const fixtures = await seedFixtures(orgId, memberId);

  await login(page, OWNER_EMAIL);
  await page.context().storageState({ path: AUTH_FILES.owner });

  // member / viewer は別コンテキストで取る。同じコンテキストを使い回すと
  // Cookie が混ざり、どのロールで見ているのか分からなくなる。
  for (const [email, file] of [
    [MEMBER_EMAIL, AUTH_FILES.member],
    [VIEWER_EMAIL, AUTH_FILES.viewer],
  ] as const) {
    const context = await browser.newContext();
    const rolePage = await context.newPage();
    await login(rolePage, email);
    await context.storageState({ path: file });
    await context.close();
  }

  const { writeFile } = await import('node:fs/promises');
  await writeFile(FIXTURES_FILE, JSON.stringify(fixtures, null, 2));
});
