// @vitest-environment node

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeRlsClient, rlsClient } from './rls-client';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testId = `d${Date.now().toString(36)}`;

describe('RLS: domain tables tenant isolation', () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let clientA: ReturnType<typeof rlsClient>;
  let clientB: ReturnType<typeof rlsClient>;

  // Test entity IDs for org A
  let deptAId: string;
  let empAId: string;
  let empA2Id: string;
  let skillAId: string;
  let cycleAId: string;

  beforeAll(async () => {
    // Create orgs
    const { data: orgA } = await admin
      .from('organizations')
      .insert({ name: `Org A ${testId}`, slug: `org-a-${testId}` })
      .select()
      .single();
    orgAId = orgA!.id;

    const { data: orgB } = await admin
      .from('organizations')
      .insert({ name: `Org B ${testId}`, slug: `org-b-${testId}` })
      .select()
      .single();
    orgBId = orgB!.id;

    // Create users
    const { data: userAData } = await admin.auth.admin.createUser({
      email: `domain-a-${testId}@test.example.com`,
      password: 'test-password-123',
      email_confirm: true,
    });
    userAId = userAData.user!.id;

    const { data: userBData } = await admin.auth.admin.createUser({
      email: `domain-b-${testId}@test.example.com`,
      password: 'test-password-123',
      email_confirm: true,
    });
    userBId = userBData.user!.id;

    // Create memberships
    await admin.from('memberships').insert([
      { user_id: userAId, org_id: orgAId, role: 'owner' },
      { user_id: userBId, org_id: orgBId, role: 'owner' },
    ]);

    // Create test data for org A
    const { data: deptA } = await admin
      .from('departments')
      .insert({ org_id: orgAId, name: `Dept A ${testId}` })
      .select()
      .single();
    deptAId = deptA!.id;

    const { data: empA } = await admin
      .from('employees')
      .insert({
        org_id: orgAId,
        employee_code: `EMP-A1-${testId}`,
        full_name: 'Employee A1',
        department_id: deptAId,
      })
      .select()
      .single();
    empAId = empA!.id;

    const { data: empA2 } = await admin
      .from('employees')
      .insert({
        org_id: orgAId,
        employee_code: `EMP-A2-${testId}`,
        full_name: 'Employee A2',
      })
      .select()
      .single();
    empA2Id = empA2!.id;

    const { data: skillA } = await admin
      .from('skills')
      .insert({ org_id: orgAId, name: `Skill A ${testId}`, category: 'tech' })
      .select()
      .single();
    skillAId = skillA!.id;

    await admin.from('employee_skills').insert({
      org_id: orgAId,
      employee_id: empAId,
      skill_id: skillAId,
      level: 3,
    });

    await admin.from('one_on_ones').insert({
      org_id: orgAId,
      employee_id: empAId,
      interviewer_id: empA2Id,
      held_on: '2026-08-01',
      notes: 'Test 1on1',
      mood_score: 4,
    });

    const { data: cycleA } = await admin
      .from('evaluation_cycles')
      .insert({
        org_id: orgAId,
        name: `Cycle A ${testId}`,
        period_start: '2026-04-01',
        period_end: '2026-09-30',
      })
      .select()
      .single();
    cycleAId = cycleA!.id;

    await admin.from('evaluations').insert({
      org_id: orgAId,
      cycle_id: cycleAId,
      employee_id: empAId,
      evaluator_id: empA2Id,
    });

    // Create test data for org B
    await admin.from('departments').insert({ org_id: orgBId, name: `Dept B ${testId}` });

    await admin.from('employees').insert({
      org_id: orgBId,
      employee_code: `EMP-B1-${testId}`,
      full_name: 'Employee B1',
    });

    // Data API は閉じているため（20260822000001）、RLS ポリシーの検証は
    // 直接接続でロールを切り替えて行う。詳細は ./rls-client.ts を参照。
    clientA = rlsClient({ sub: userAId, orgId: orgAId });
    clientB = rlsClient({ sub: userBId, orgId: orgBId });
  }, 30_000);

  afterAll(async () => {
    // purge_organization は監査ログを含む全関連データをカスケード削除する。
    // 以前はここで存在しない RPC (delete_audit_logs_for_test) を呼んでおり、
    // エラーが無視された結果 organizations の削除が毎回失敗し、
    // テスト用の組織がローカル DB に残り続けていた。
    for (const orgId of [orgAId, orgBId]) {
      if (!orgId) continue;
      const { error } = await admin.rpc('purge_organization', { p_org_id: orgId });
      expect(error).toBeNull();
    }
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
    await closeRlsClient();
  });

  // ---------------------------------------------------------------------------
  // departments
  // ---------------------------------------------------------------------------
  describe('departments', () => {
    it('user A sees only org A departments', async () => {
      const { data } = await clientA.from('departments').select();
      expect(data!.every((d: { org_id: string }) => d.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A departments', async () => {
      const { data } = await clientB.from('departments').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('user B cannot update org A department', async () => {
      const { data } = await clientB
        .from('departments')
        .update({ name: 'Hacked' })
        .eq('id', deptAId)
        .select();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // employees
  // ---------------------------------------------------------------------------
  describe('employees', () => {
    it('user A sees only org A employees', async () => {
      const { data } = await clientA.from('employees').select();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((e: { org_id: string }) => e.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A employees', async () => {
      const { data } = await clientB.from('employees').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('user B cannot insert employee into org A', async () => {
      const { error } = await clientB.from('employees').insert({
        org_id: orgAId,
        employee_code: 'HACK-01',
        full_name: 'Hacker',
      });
      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // skills
  // ---------------------------------------------------------------------------
  describe('skills', () => {
    it('user A sees only org A skills', async () => {
      const { data } = await clientA.from('skills').select();
      expect(data!.every((s: { org_id: string }) => s.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A skills', async () => {
      const { data } = await clientB.from('skills').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // employee_skills
  // ---------------------------------------------------------------------------
  describe('employee_skills', () => {
    it('user A sees only org A employee_skills', async () => {
      const { data } = await clientA.from('employee_skills').select();
      expect(data!.every((es: { org_id: string }) => es.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A employee_skills', async () => {
      const { data } = await clientB.from('employee_skills').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // one_on_ones
  // ---------------------------------------------------------------------------
  describe('one_on_ones', () => {
    it('user A sees only org A one_on_ones', async () => {
      const { data } = await clientA.from('one_on_ones').select();
      expect(data!.every((o: { org_id: string }) => o.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A one_on_ones', async () => {
      const { data } = await clientB.from('one_on_ones').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // evaluation_cycles
  // ---------------------------------------------------------------------------
  describe('evaluation_cycles', () => {
    it('user A sees only org A evaluation_cycles', async () => {
      const { data } = await clientA.from('evaluation_cycles').select();
      expect(data!.every((c: { org_id: string }) => c.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A evaluation_cycles', async () => {
      const { data } = await clientB.from('evaluation_cycles').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // evaluations
  // ---------------------------------------------------------------------------
  describe('evaluations', () => {
    it('user A sees only org A evaluations', async () => {
      const { data } = await clientA.from('evaluations').select();
      expect(data!.every((e: { org_id: string }) => e.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A evaluations', async () => {
      const { data } = await clientB.from('evaluations').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('同じサイクル・同じ被評価者×評価者の評価は2件作れない', async () => {
      // createEvaluation() は事前に SELECT で重複を見ているが、確認と INSERT の
      // 間に別のリクエストが入ると通り抜ける。同時実行を実際に止めるのは
      // この一意制約なので、DB 側で効いていることを直接確かめる。
      //
      // 既存の1件と同じ組み合わせを狙って入れる。自前で1件目を作ると
      // フィクスチャと衝突して「1件目が失敗する」テストになってしまう。
      const { data: existing } = await admin
        .from('evaluations')
        .select('org_id,cycle_id,employee_id,evaluator_id')
        .eq('org_id', orgAId)
        .limit(1);

      expect(existing).toHaveLength(1);

      const { error } = await admin.from('evaluations').insert(existing![0]);

      expect(error).not.toBeNull();
      expect(error!.message).toContain('evaluations_unique_per_pair');
    });
  });

  // ---------------------------------------------------------------------------
  // audit_logs
  // ---------------------------------------------------------------------------
  describe('audit_logs', () => {
    it('user A sees only org A audit_logs', async () => {
      const { data } = await clientA.from('audit_logs').select();
      expect(data!.every((l: { org_id: string }) => l.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A audit_logs', async () => {
      const { data } = await clientB.from('audit_logs').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('UPDATE on audit_logs is rejected', async () => {
      const { data: logs } = await admin
        .from('audit_logs')
        .select('id')
        .eq('org_id', orgAId)
        .limit(1);
      if (logs && logs.length > 0) {
        const { error } = await admin
          .from('audit_logs')
          .update({ action: 'hacked' })
          .eq('id', logs[0].id);
        expect(error).not.toBeNull();
        expect(error!.message).toContain('cannot be modified');
      }
    });

    it('DELETE on audit_logs is rejected', async () => {
      const { data: logs } = await admin
        .from('audit_logs')
        .select('id')
        .eq('org_id', orgAId)
        .limit(1);
      if (logs && logs.length > 0) {
        const { error } = await admin.from('audit_logs').delete().eq('id', logs[0].id);
        expect(error).not.toBeNull();
        expect(error!.message).toContain('cannot be modified');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // organization purge
  //
  // audit_logs は変更禁止トリガで守られている一方、organizations からは
  // ON DELETE CASCADE で参照されている。そのままでは監査ログを持つ組織を
  // 一切削除できないため、明示的なパージ経路を用意している。
  // ---------------------------------------------------------------------------
  describe('organization purge', () => {
    let throwawayOrgId: string;

    beforeAll(async () => {
      const { data: org } = await admin
        .from('organizations')
        .insert({ name: `Purge ${testId}`, slug: `purge-${testId}` })
        .select()
        .single();
      throwawayOrgId = org!.id;

      await admin
        .from('employees')
        .insert({ org_id: throwawayOrgId, employee_code: 'PURGE-001', full_name: 'パージ対象' });

      // 監査ログを持つ状態にする。20260822000002 でドメインテーブルの
      // 監査トリガを撤去したため、記録は Service Layer が行う。
      // ここはその代役として直接投入する。
      await admin.from('audit_logs').insert({
        org_id: throwawayOrgId,
        action: 'employee.create',
        resource_type: 'employee',
      });
    });

    it('has audit logs before purge', async () => {
      const { data } = await admin.from('audit_logs').select('id').eq('org_id', throwawayOrgId);
      expect(data!.length).toBeGreaterThan(0);
    });

    it('rejects deleting the organization directly', async () => {
      const { error } = await admin.from('organizations').delete().eq('id', throwawayOrgId);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('cannot be modified');
    });

    it('purges the organization and its audit logs via service_role', async () => {
      const { error } = await admin.rpc('purge_organization', { p_org_id: throwawayOrgId });
      expect(error).toBeNull();

      const { data: orgs } = await admin
        .from('organizations')
        .select('id')
        .eq('id', throwawayOrgId);
      expect(orgs).toHaveLength(0);

      const { data: logs } = await admin
        .from('audit_logs')
        .select('id')
        .eq('org_id', throwawayOrgId);
      expect(logs).toHaveLength(0);

      const { data: emps } = await admin
        .from('employees')
        .select('id')
        .eq('org_id', throwawayOrgId);
      expect(emps).toHaveLength(0);
    });

    it('does not leak the purge flag to later statements', async () => {
      await admin.from('audit_logs').insert({
        org_id: orgAId,
        action: 'employee.create',
        resource_type: 'employee',
      });

      const { data: logs } = await admin
        .from('audit_logs')
        .select('id')
        .eq('org_id', orgAId)
        .limit(1);
      expect(logs!.length).toBeGreaterThan(0);

      const { error } = await admin.from('audit_logs').delete().eq('id', logs![0].id);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('cannot be modified');
    });
  });

  // ---------------------------------------------------------------------------
  // employee_risk_scores view
  // ---------------------------------------------------------------------------
  describe('employee_risk_scores', () => {
    it('user A can query risk scores for own org', async () => {
      const { data, error } = await clientA.from('employee_risk_scores').select();
      expect(error).toBeNull();
      expect(data!.every((r: { org_id: string }) => r.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A risk scores', async () => {
      const { data } = await clientB.from('employee_risk_scores').select().eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('risk score fields are present and valid', async () => {
      const { data } = await admin
        .from('employee_risk_scores')
        .select()
        .eq('employee_id', empAId)
        .single();
      if (data) {
        expect(data.total_score).toBeGreaterThanOrEqual(0);
        expect(data.total_score).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high']).toContain(data.risk_level);
      }
    });
  });
});
