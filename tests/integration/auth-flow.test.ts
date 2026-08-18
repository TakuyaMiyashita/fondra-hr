// @vitest-environment node

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testId = `auth${Date.now().toString(36)}`;

describe('Auth flow integration', () => {
  let userId: string;
  let orgId: string;

  afterAll(async () => {
    if (orgId) {
      await admin.from('memberships').delete().eq('org_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('signup creates user, then org + membership can be added', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `authtest-${testId}@test.example.com`,
      password: 'test-password-123',
      email_confirm: true,
    });
    expect(error).toBeNull();
    userId = data.user!.id;

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({ name: `Auth Test Org ${testId}`, slug: `auth-test-${testId}` })
      .select()
      .single();
    expect(orgErr).toBeNull();
    orgId = org.id;

    const { error: memErr } = await admin
      .from('memberships')
      .insert({ user_id: userId, org_id: orgId, role: 'owner' });
    expect(memErr).toBeNull();
  });

  it('login returns session with org_id and role in JWT', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await client.auth.signInWithPassword({
      email: `authtest-${testId}@test.example.com`,
      password: 'test-password-123',
    });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();

    const jwt = JSON.parse(atob(data.session!.access_token.split('.')[1]));
    expect(jwt.app_metadata.org_id).toBe(orgId);
    expect(jwt.app_metadata.role).toBe('owner');
  });

  it('org switch via JWT re-issue', async () => {
    const { data: org2, error: org2Err } = await admin
      .from('organizations')
      .insert({ name: `Auth Test Org2 ${testId}`, slug: `auth-test2-${testId}` })
      .select()
      .single();
    expect(org2Err).toBeNull();
    const org2Id = org2.id;

    await admin.from('memberships').insert({ user_id: userId, org_id: org2Id, role: 'admin' });

    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: `authtest-${testId}@test.example.com`,
      password: 'test-password-123',
    });

    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { org_id: org2Id },
    });

    const { data: refreshed } = await client.auth.refreshSession();
    expect(refreshed.session).not.toBeNull();

    const jwt = JSON.parse(atob(refreshed.session!.access_token.split('.')[1]));
    expect(jwt.app_metadata.org_id).toBe(org2Id);
    expect(jwt.app_metadata.role).toBe('admin');

    // Cleanup org2
    await admin.from('memberships').delete().eq('org_id', org2Id);
    await admin.from('organizations').delete().eq('id', org2Id);
  });

  /**
   * 回帰テスト。組織切替は当初 updateUser({ data }) で実装されていたが、
   * これが書くのは user_metadata で、JWT フック
   * (custom_access_token_hook) が読むのは app_metadata。
   * そのため「切り替えたのに切り替わらない」不具合になっていた。
   *
   * 実装が user_metadata 側へ戻ったらここが落ちる。
   */
  it('writing org_id into user_metadata does NOT switch the JWT org', async () => {
    const { data: org3 } = await admin
      .from('organizations')
      .insert({ name: `Auth Test Org3 ${testId}`, slug: `auth-test3-${testId}` })
      .select()
      .single();
    const org3Id = org3.id;

    await admin.from('memberships').insert({ user_id: userId, org_id: org3Id, role: 'member' });

    // app_metadata を既知の状態（org1）に戻してからログインする
    await admin.auth.admin.updateUserById(userId, { app_metadata: { org_id: orgId } });

    const client = createClient(SUPABASE_URL, ANON_KEY);
    await client.auth.signInWithPassword({
      email: `authtest-${testId}@test.example.com`,
      password: 'test-password-123',
    });

    // 旧実装と同じ経路：user_metadata に org_id を書く
    const { error: updateErr } = await client.auth.updateUser({ data: { org_id: org3Id } });
    expect(updateErr).toBeNull();

    const { data: refreshed } = await client.auth.refreshSession();
    const jwt = JSON.parse(atob(refreshed.session!.access_token.split('.')[1]));

    // user_metadata には入るが、クレームの org_id は元のまま＝切り替わっていない
    expect(jwt.user_metadata.org_id).toBe(org3Id);
    expect(jwt.app_metadata.org_id).toBe(orgId);
    expect(jwt.app_metadata.org_id).not.toBe(org3Id);

    await admin.from('memberships').delete().eq('org_id', org3Id);
    await admin.from('organizations').delete().eq('id', org3Id);
  });

  /**
   * JWT フックはクレームの org_id が「今も有効なメンバーシップか」を
   * 検証し、無効なら先頭のメンバーシップへフォールバックする。
   * app_metadata を直接書ける service_role 経路の最後の安全網なので、
   * ここが外れると退会済みテナントの JWT が生き続ける。
   */
  it('falls back to a valid membership when app_metadata points at a foreign org', async () => {
    const { data: foreignOrg } = await admin
      .from('organizations')
      .insert({ name: `Auth Foreign Org ${testId}`, slug: `auth-foreign-${testId}` })
      .select()
      .single();

    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { org_id: foreignOrg.id },
    });

    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { data } = await client.auth.signInWithPassword({
      email: `authtest-${testId}@test.example.com`,
      password: 'test-password-123',
    });

    const jwt = JSON.parse(atob(data.session!.access_token.split('.')[1]));
    expect(jwt.app_metadata.org_id).not.toBe(foreignOrg.id);
    expect(jwt.app_metadata.org_id).toBe(orgId);
    expect(jwt.app_metadata.role).toBe('owner');

    await admin.from('organizations').delete().eq('id', foreignOrg.id);
  });

  it('invitation can be created and queried', async () => {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inv, error: invErr } = await admin
      .from('invitations')
      .insert({
        org_id: orgId,
        email: `invite-${testId}@test.example.com`,
        role: 'member',
        expires_at: expires,
      })
      .select()
      .single();
    expect(invErr).toBeNull();
    expect(inv.token).toBeTruthy();

    const { data: found } = await admin
      .from('invitations')
      .select()
      .eq('token', inv.token)
      .single();
    expect(found).not.toBeNull();
    expect(found.email).toBe(`invite-${testId}@test.example.com`);

    // Cleanup
    await admin.from('invitations').delete().eq('id', inv.id);
  });
});
