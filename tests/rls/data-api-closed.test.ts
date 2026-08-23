// @vitest-environment node

/**
 * Data API（PostgREST）が anon / authenticated から閉じていることの検証。
 *
 * 認可（ロール × リソース × 操作）は Service Layer にしか無い（ADR 0001）。
 * Data API が開いていると、ログイン中のユーザーが Service Layer を通さずに
 * 直接テーブルを叩けてしまい、認可が丸ごと迂回される。
 *
 * ここで塞いだ穴の実例（20260822000001 以前は全部通っていた）:
 *
 *   PATCH /rest/v1/memberships?user_id=eq.<自分>  {"role":"owner"}
 *     → 次のトークン更新で JWT の role が owner になる。組織の完全掌握。
 *
 * tests/rls/*.test.ts がテナント跨ぎしか見ていなかったため、
 * 同一組織内でのロール昇格は素通りしていた。同じ見落としを繰り返さないよう、
 * 組織内の攻撃も明示的に並べておく。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** PostgREST が権限不足で拒否したときのコード。 */
const PERMISSION_DENIED = '42501';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testId = `api${Date.now().toString(36)}`;

const TABLES = [
  'organizations',
  'memberships',
  'invitations',
  'departments',
  'employees',
  'skills',
  'employee_skills',
  'one_on_ones',
  'evaluation_cycles',
  'evaluations',
  'audit_logs',
  'employee_risk_scores',
] as const;

describe('Data API は anon / authenticated から閉じている', () => {
  let orgId: string;
  let viewerId: string;
  let viewerMembershipId: string;
  let employeeId: string;
  let viewerClient: SupabaseClient;
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);

  beforeAll(async () => {
    const { data: org } = await admin
      .from('organizations')
      .insert({ name: `Org ${testId}`, slug: `org-${testId}` })
      .select()
      .single();
    orgId = org!.id;

    const { data: user } = await admin.auth.admin.createUser({
      email: `viewer-${testId}@test.example.com`,
      password: 'test-password-123',
      email_confirm: true,
    });
    viewerId = user.user!.id;

    // わざと最弱のロールで作る。ここから owner まで上がれてしまうのが元の穴。
    const { data: membership } = await admin
      .from('memberships')
      .insert({ user_id: viewerId, org_id: orgId, role: 'viewer' })
      .select()
      .single();
    viewerMembershipId = membership!.id;

    const { data: employee } = await admin
      .from('employees')
      .insert({
        org_id: orgId,
        employee_code: `EMP-${testId}`,
        full_name: '被害者 太郎',
        birth_date: '1990-01-01',
      })
      .select()
      .single();
    employeeId = employee!.id;

    viewerClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await viewerClient.auth.signInWithPassword({
      email: `viewer-${testId}@test.example.com`,
      password: 'test-password-123',
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await admin.rpc('purge_organization', { p_org_id: orgId });
    await admin.auth.admin.deleteUser(viewerId);
  });

  it('ログイン自体は成功し、JWT に org_id と role が入る', async () => {
    // GRANT を剥がしても JWT フックは動く必要がある。
    // memberships の supabase_auth_admin への SELECT を落とすとここが壊れる。
    const {
      data: { session },
    } = await viewerClient.auth.getSession();

    const claims = JSON.parse(
      Buffer.from(session!.access_token.split('.')[1], 'base64url').toString(),
    );

    expect(claims.app_metadata.org_id).toBe(orgId);
    expect(claims.app_metadata.role).toBe('viewer');
  });

  describe.each(TABLES)('%s', (table) => {
    it('authenticated は SELECT できない', async () => {
      const { error } = await viewerClient.from(table).select();
      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it('anon は SELECT できない', async () => {
      const { error } = await anonClient.from(table).select();
      expect(error?.code).toBe(PERMISSION_DENIED);
    });
  });

  describe('Service Layer を迂回した組織内の権限昇格', () => {
    it('viewer は自分のロールを owner に書き換えられない', async () => {
      // これが通ると、次のトークン更新で JWT の role が owner になり
      // 組織を完全に掌握できる。修正前は 200 で通っていた。
      const { error } = await viewerClient
        .from('memberships')
        .update({ role: 'owner' })
        .eq('id', viewerMembershipId);

      expect(error?.code).toBe(PERMISSION_DENIED);

      const { data } = await admin
        .from('memberships')
        .select('role')
        .eq('id', viewerMembershipId)
        .single();
      expect(data!.role).toBe('viewer');
    });

    it('viewer は owner 権限の招待を発行できない', async () => {
      const { error } = await viewerClient.from('invitations').insert({
        org_id: orgId,
        email: `attacker-${testId}@test.example.com`,
        role: 'owner',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it('viewer は従業員を削除できない', async () => {
      const { error } = await viewerClient.from('employees').delete().eq('id', employeeId);

      expect(error?.code).toBe(PERMISSION_DENIED);

      const { data } = await admin.from('employees').select('id').eq('id', employeeId);
      expect(data).toHaveLength(1);
    });

    it('viewer は生年月日を読めない', async () => {
      // Service Layer では admin 以上と本人にしか返していない
      // （src/services/field-visibility.ts）。
      const { error } = await viewerClient.from('employees').select('full_name,birth_date');

      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it('viewer は 1on1 の面談メモを読めない', async () => {
      // Service Layer では当事者にしか返していない（src/services/self.ts）。
      const { error } = await viewerClient.from('one_on_ones').select('notes');

      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it('viewer は purge_organization を呼べない', async () => {
      // 組織ごとデータを消す関数。service_role 専用にしてある。
      const { error } = await viewerClient.rpc('purge_organization', { p_org_id: orgId });

      expect(error).not.toBeNull();
    });

    it('viewer は評価コメントを読めない', async () => {
      // Service Layer では確定後の被評価者本人までに絞っている（ADR 0004）。
      const { error } = await viewerClient.from('evaluations').select('comment');

      expect(error?.code).toBe(PERMISSION_DENIED);
    });
  });
});
