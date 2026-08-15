// @vitest-environment node

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testId = Date.now().toString(36);

describe('RLS: tenant isolation', () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let invitationBId: string;

  beforeAll(async () => {
    // Create two organizations
    const { data: orgA, error: orgAErr } = await admin
      .from('organizations')
      .insert({ name: `Org A ${testId}`, slug: `org-a-${testId}` })
      .select()
      .single();
    if (orgAErr) throw orgAErr;
    orgAId = orgA.id;

    const { data: orgB, error: orgBErr } = await admin
      .from('organizations')
      .insert({ name: `Org B ${testId}`, slug: `org-b-${testId}` })
      .select()
      .single();
    if (orgBErr) throw orgBErr;
    orgBId = orgB.id;

    // Create two users
    const { data: userAData, error: userAErr } = await admin.auth.admin.createUser({
      email: `user-a-${testId}@test.example.com`,
      password: 'test-password-123',
      email_confirm: true,
    });
    if (userAErr) throw userAErr;
    userAId = userAData.user.id;

    const { data: userBData, error: userBErr } = await admin.auth.admin.createUser({
      email: `user-b-${testId}@test.example.com`,
      password: 'test-password-123',
      email_confirm: true,
    });
    if (userBErr) throw userBErr;
    userBId = userBData.user.id;

    // Create memberships (user A → org A, user B → org B)
    const { error: memErr } = await admin.from('memberships').insert([
      { user_id: userAId, org_id: orgAId, role: 'owner' },
      { user_id: userBId, org_id: orgBId, role: 'owner' },
    ]);
    if (memErr) throw memErr;

    // Create test invitations
    const { error: invAErr } = await admin.from('invitations').insert({
      org_id: orgAId,
      email: `invite-a-${testId}@test.example.com`,
      role: 'member',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    if (invAErr) throw invAErr;

    const { data: invB, error: invBErr } = await admin
      .from('invitations')
      .insert({
        org_id: orgBId,
        email: `invite-b-${testId}@test.example.com`,
        role: 'member',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select()
      .single();
    if (invBErr) throw invBErr;
    invitationBId = invB.id;

    // Sign in as user A → Custom Access Token Hook enriches JWT with org A
    clientA = createClient(SUPABASE_URL, ANON_KEY);
    const { error: signInAErr } = await clientA.auth.signInWithPassword({
      email: `user-a-${testId}@test.example.com`,
      password: 'test-password-123',
    });
    if (signInAErr) throw signInAErr;

    // Sign in as user B → Custom Access Token Hook enriches JWT with org B
    clientB = createClient(SUPABASE_URL, ANON_KEY);
    const { error: signInBErr } = await clientB.auth.signInWithPassword({
      email: `user-b-${testId}@test.example.com`,
      password: 'test-password-123',
    });
    if (signInBErr) throw signInBErr;
  }, 30_000);

  afterAll(async () => {
    await admin.from('invitations').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('memberships').delete().in('org_id', [orgAId, orgBId]);
    await admin.from('organizations').delete().in('id', [orgAId, orgBId]);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  // ---------------------------------------------------------------------------
  // organizations
  // ---------------------------------------------------------------------------
  describe('organizations', () => {
    it('user A can see only org A', async () => {
      const { data } = await clientA.from('organizations').select();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(orgAId);
    });

    it('user B can see only org B', async () => {
      const { data } = await clientB.from('organizations').select();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(orgBId);
    });

    it('user A cannot update org B', async () => {
      const { data } = await clientA
        .from('organizations')
        .update({ name: 'Hacked' })
        .eq('id', orgBId)
        .select();
      expect(data).toHaveLength(0);

      // Verify org B is unchanged
      const { data: orgB } = await admin
        .from('organizations')
        .select('name')
        .eq('id', orgBId)
        .single();
      expect(orgB!.name).toBe(`Org B ${testId}`);
    });
  });

  // ---------------------------------------------------------------------------
  // memberships
  // ---------------------------------------------------------------------------
  describe('memberships', () => {
    it('user A can see only org A memberships', async () => {
      const { data } = await clientA.from('memberships').select();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((m: { org_id: string }) => m.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A memberships', async () => {
      const { data } = await clientB
        .from('memberships')
        .select()
        .eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('user A cannot insert membership into org B', async () => {
      const { error } = await clientA.from('memberships').insert({
        user_id: userAId,
        org_id: orgBId,
        role: 'member',
      });
      expect(error).not.toBeNull();
    });

    it('user A cannot delete memberships in org B', async () => {
      const { data } = await clientA
        .from('memberships')
        .delete()
        .eq('org_id', orgBId)
        .select();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // invitations
  // ---------------------------------------------------------------------------
  describe('invitations', () => {
    it('user A can see only org A invitations', async () => {
      const { data } = await clientA.from('invitations').select();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((i: { org_id: string }) => i.org_id === orgAId)).toBe(true);
    });

    it('user B cannot see org A invitations', async () => {
      const { data } = await clientB
        .from('invitations')
        .select()
        .eq('org_id', orgAId);
      expect(data).toHaveLength(0);
    });

    it('user A cannot insert invitation into org B', async () => {
      const { error } = await clientA.from('invitations').insert({
        org_id: orgBId,
        email: 'hacker@test.example.com',
        role: 'admin',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it('user A cannot update invitations in org B', async () => {
      const { data } = await clientA
        .from('invitations')
        .update({ role: 'admin' })
        .eq('id', invitationBId)
        .select();
      expect(data).toHaveLength(0);
    });

    it('user A cannot delete invitations in org B', async () => {
      const { data } = await clientA
        .from('invitations')
        .delete()
        .eq('id', invitationBId)
        .select();
      expect(data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom Access Token Hook
  // ---------------------------------------------------------------------------
  describe('Custom Access Token Hook', () => {
    it('JWT contains org_id and role after sign-in', async () => {
      const {
        data: { session },
      } = await clientA.auth.getSession();
      expect(session).not.toBeNull();

      const jwt = JSON.parse(atob(session!.access_token.split('.')[1]));
      expect(jwt.app_metadata.org_id).toBe(orgAId);
      expect(jwt.app_metadata.role).toBe('owner');
    });

    it('JWT reflects org B for user B', async () => {
      const {
        data: { session },
      } = await clientB.auth.getSession();
      const jwt = JSON.parse(atob(session!.access_token.split('.')[1]));
      expect(jwt.app_metadata.org_id).toBe(orgBId);
      expect(jwt.app_metadata.role).toBe('owner');
    });
  });
});
