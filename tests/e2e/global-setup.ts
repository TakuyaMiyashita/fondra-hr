import { test as setup, expect } from '@playwright/test';

const TEST_EMAIL = 'e2e-test@example.com';
const TEST_PASSWORD = 'e2e-test-password123';
const TEST_ORG = 'E2Eテスト組織';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const AUTH_FILE = 'tests/e2e/.auth/user.json';

async function ensureTestUser(): Promise<string> {
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  const listData = await listRes.json();
  const existing = listData.users?.find(
    (u: { email: string }) => u.email === TEST_EMAIL,
  );
  if (existing) return existing.id;

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`Failed to create user: ${JSON.stringify(created)}`);
  return created.id;
}

async function ensureTestOrg(userId: string): Promise<string> {
  const memRes = await fetch(
    `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${userId}&select=org_id`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    },
  );
  const memberships = await memRes.json();
  if (memberships.length > 0) return memberships[0].org_id;

  const slug = `e2e-test-${Date.now().toString(36)}`;
  const orgRes = await fetch(`${SUPABASE_URL}/rest/v1/organizations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name: TEST_ORG, slug }),
  });
  const orgs = await orgRes.json();
  if (!orgRes.ok) throw new Error(`Failed to create org: ${JSON.stringify(orgs)}`);

  await fetch(`${SUPABASE_URL}/rest/v1/memberships`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      org_id: orgs[0].id,
      role: 'owner',
    }),
  });

  return orgs[0].id;
}

setup('authenticate', async ({ page }) => {
  const userId = await ensureTestUser();
  await ensureTestOrg(userId);

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('#email').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).click();

  await page.waitForURL('**/employees', { timeout: 15_000 });
  await expect(page.locator('body')).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
