import { test as setup, expect, type Page } from '@playwright/test';

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

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

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

function headers(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: SERVICE_ROLE_KEY,
    ...extra,
  };
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  return res.json() as Promise<T>;
}

async function insert<T>(table: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed to insert into ${table}: ${JSON.stringify(json)}`);
  return json as T;
}

async function ensureUser(email: string): Promise<string> {
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { headers: headers() });
  const listData = await listRes.json();
  const existing = listData.users?.find((u: { email: string }) => u.email === email);
  if (existing) return existing.id;

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password: E2E_PASSWORD, email_confirm: true }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`Failed to create user: ${JSON.stringify(created)}`);
  return created.id;
}

async function ensureOrg(ownerId: string): Promise<string> {
  const memberships = await rest<{ org_id: string }[]>(
    `memberships?user_id=eq.${ownerId}&select=org_id`,
  );
  if (memberships.length > 0) return memberships[0].org_id;

  const slug = `e2e-test-${Date.now().toString(36)}`;
  const orgs = await insert<{ id: string }[]>('organizations', { name: TEST_ORG, slug });
  await ensureMembership(ownerId, orgs[0].id, 'owner');
  return orgs[0].id;
}

/**
 * メンバーシップだけ作れば JWT の claim は入る。
 * custom_access_token_hook は app_metadata に org_id が無ければ
 * 最初のメンバーシップにフォールバックするため、app_metadata の
 * 事前設定は要らない（supabase/migrations の同関数を参照）。
 */
async function ensureMembership(userId: string, orgId: string, role: string): Promise<void> {
  const existing = await rest<unknown[]>(
    `memberships?user_id=eq.${userId}&org_id=eq.${orgId}&select=user_id`,
  );
  if (existing.length > 0) return;
  await insert('memberships', { user_id: userId, org_id: orgId, role });
}

async function ensureEmployee(
  orgId: string,
  employee: Record<string, unknown> & { employee_code: string },
): Promise<string> {
  const existing = await rest<{ id: string }[]>(
    `employees?org_id=eq.${orgId}&employee_code=eq.${employee.employee_code}&select=id`,
  );
  if (existing.length > 0) return existing[0].id;

  const rows = await insert<{ id: string }[]>('employees', { org_id: orgId, ...employee });
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

  const existingOneOnOnes = await rest<{ notes: string | null }[]>(
    `one_on_ones?org_id=eq.${orgId}&select=notes`,
  );
  const notes = existingOneOnOnes.map((r) => r.notes);

  if (!notes.includes(MARKERS.othersNotes)) {
    // 当事者に member を含まない記録。member からは一覧にも出てはならない。
    await insert('one_on_ones', {
      org_id: orgId,
      employee_id: othersEmployeeId,
      interviewer_id: thirdEmployeeId,
      held_on: '2026-06-01',
      notes: MARKERS.othersNotes,
    });
  }
  if (!notes.includes(MARKERS.selfNotes)) {
    await insert('one_on_ones', {
      org_id: orgId,
      employee_id: selfEmployeeId,
      interviewer_id: othersEmployeeId,
      held_on: '2026-06-02',
      notes: MARKERS.selfNotes,
    });
  }

  const cycles = await rest<{ id: string }[]>(
    `evaluation_cycles?org_id=eq.${orgId}&name=eq.${encodeURIComponent(MARKERS.cycleName)}&select=id`,
  );
  const cycleId =
    cycles.length > 0
      ? cycles[0].id
      : (
          await insert<{ id: string }[]>('evaluation_cycles', {
            org_id: orgId,
            name: MARKERS.cycleName,
            period_start: '2026-04-01',
            period_end: '2026-09-30',
            status: 'in_progress',
          })
        )[0].id;

  const existingEvals = await rest<{ comment: string | null }[]>(
    `evaluations?cycle_id=eq.${cycleId}&select=comment`,
  );
  const comments = existingEvals.map((r) => r.comment);

  if (!comments.includes(MARKERS.othersComment)) {
    // 評価者が member でない評価。コメントは member から見えてはならない。
    await insert('evaluations', {
      org_id: orgId,
      cycle_id: cycleId,
      employee_id: othersEmployeeId,
      evaluator_id: thirdEmployeeId,
      comment: MARKERS.othersComment,
    });
  }
  if (!comments.includes(MARKERS.selfComment)) {
    await insert('evaluations', {
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
    await insert('evaluations', {
      org_id: orgId,
      cycle_id: cycleId,
      employee_id: selfEmployeeId,
      evaluator_id: othersEmployeeId,
      comment: MARKERS.confirmedComment,
      status: 'confirmed',
    });
  }
  if (!comments.includes(MARKERS.unconfirmedComment)) {
    await insert('evaluations', {
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
  const ownerId = await ensureUser(OWNER_EMAIL);
  const orgId = await ensureOrg(ownerId);

  const memberId = await ensureUser(MEMBER_EMAIL);
  await ensureMembership(memberId, orgId, 'member');

  const viewerId = await ensureUser(VIEWER_EMAIL);
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
