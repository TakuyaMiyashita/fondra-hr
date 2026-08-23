// @vitest-environment node

/**
 * avatars バケットのポリシー検証。
 *
 * Storage はブラウザから直接叩けるため、Service Layer が経路上に無い。
 * `updateEmployeeAvatar()` が admin 以上を要求していても、ポリシーが
 * org_id しか見ていなければ viewer が全アバターを上書き・削除できてしまう。
 * ここはポリシーが唯一の実行地点なので、ロール制御をポリシーに持たせている
 * （20260823000001。テーブルの方針＝ADR 0001 とは前提が違う）。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testId = `st${Date.now().toString(36)}`;

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
type Role = (typeof ROLES)[number];

function pngBlob() {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
}

describe('Storage: avatars バケットのポリシー', () => {
  let orgId: string;
  let otherOrgId: string;
  const userIds: string[] = [];
  const clients = {} as Record<Role, SupabaseClient>;
  let otherOrgClient: SupabaseClient;

  async function signIn(email: string): Promise<SupabaseClient> {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({
      email,
      password: 'test-password-123',
    });
    if (error) throw error;
    return client;
  }

  async function createMember(org: string, role: string, label: string) {
    const email = `storage-${label}-${testId}@test.example.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: 'test-password-123',
      email_confirm: true,
    });
    userIds.push(data.user!.id);
    await admin.from('memberships').insert({ user_id: data.user!.id, org_id: org, role });
    return signIn(email);
  }

  beforeAll(async () => {
    const { data: org } = await admin
      .from('organizations')
      .insert({ name: `Storage ${testId}`, slug: `storage-${testId}` })
      .select()
      .single();
    orgId = org!.id;

    const { data: other } = await admin
      .from('organizations')
      .insert({ name: `Other ${testId}`, slug: `other-${testId}` })
      .select()
      .single();
    otherOrgId = other!.id;

    for (const role of ROLES) {
      clients[role] = await createMember(orgId, role, role);
    }
    otherOrgClient = await createMember(otherOrgId, 'owner', 'other');
  }, 60_000);

  afterAll(async () => {
    await admin.storage
      .from('avatars')
      .remove([`${orgId}/emp/avatar.png`, `${orgId}/seed/avatar.png`]);
    for (const org of [orgId, otherOrgId]) {
      await admin.rpc('purge_organization', { p_org_id: org });
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  describe.each(['owner', 'admin'] as const)('%s', (role) => {
    it('自組織のアバターをアップロードできる', async () => {
      const { error } = await clients[role].storage
        .from('avatars')
        .upload(`${orgId}/emp/avatar.png`, pngBlob(), { upsert: true });

      expect(error).toBeNull();
    });
  });

  describe.each(['member', 'viewer'] as const)('%s', (role) => {
    it('アップロードできない', async () => {
      // Service Layer では admin 以上に限定してある操作。
      // ポリシーが org_id しか見ていないと、ここが通ってしまう。
      const { error } = await clients[role].storage
        .from('avatars')
        .upload(`${orgId}/emp/avatar-${role}.png`, pngBlob());

      expect(error).not.toBeNull();
    });

    it('既存のアバターを削除できない', async () => {
      await admin.storage
        .from('avatars')
        .upload(`${orgId}/seed/avatar.png`, pngBlob(), { upsert: true });

      const { data } = await clients[role].storage
        .from('avatars')
        .remove([`${orgId}/seed/avatar.png`]);

      // Storage の remove は消せなかったオブジェクトを黙って除外する。
      // エラーではなく「1件も消えていないこと」で判定する。
      expect(data ?? []).toHaveLength(0);

      const { data: still } = await admin.storage.from('avatars').list(`${orgId}/seed`);
      expect(still?.map((o) => o.name)).toContain('avatar.png');
    });

    it('閲覧はできる', async () => {
      // アバターは一覧・詳細に出るもの。参照まで塞ぐと画面が壊れる。
      const { error } = await clients[role].storage.from('avatars').list(`${orgId}/seed`);

      expect(error).toBeNull();
    });
  });

  it('他組織の owner は自組織以外のアバターをアップロードできない', async () => {
    const { error } = await otherOrgClient.storage
      .from('avatars')
      .upload(`${orgId}/emp/avatar-cross.png`, pngBlob());

    expect(error).not.toBeNull();
  });
});
