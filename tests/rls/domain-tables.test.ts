// @vitest-environment node

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testId = `d${Date.now().toString(36)}`;

describe('RLS: domain tables tenant isolation', () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

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

    // Sign in
    clientA = createClient(SUPABASE_URL, ANON_KEY);
    await clientA.auth.signInWithPassword({
      email: `domain-a-${testId}@test.example.com`,
      password: 'test-password-123',
    });

    clientB = createClient(SUPABASE_URL, ANON_KEY);
    await clientB.auth.signInWithPassword({
      email: `domain-b-${testId}@test.example.com`,
      password: 'test-password-123',
    });
  }, 30_000);

  afterAll(async () => {
    // Delete in reverse dependency order (audit_logs has prevent trigger, use service_role bypass)
    await admin.rpc('delete_audit_logs_for_test', {
      org_ids: [orgAId, orgBId],
    });
    await admin.from('evaluations').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('evaluation_cycles').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('one_on_ones').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('employee_skills').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('skills').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('employees').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('departments').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('invitations').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('memberships').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('organizations').delete().in('id', [orgAId, orgBId]);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
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
  // audit log auto-recording
  // ---------------------------------------------------------------------------
  describe('audit log auto-recording', () => {
    it('inserting an employee auto-creates an audit log', async () => {
      const { data: logs } = await admin
        .from('audit_logs')
        .select()
        .eq('org_id', orgAId)
        .eq('resource_type', 'employees')
        .eq('resource_id', empAId)
        .eq('action', 'create');
      expect(logs!.length).toBeGreaterThanOrEqual(1);
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
