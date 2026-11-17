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

  /**
   * ロールの権威は DB（20260829000001 / ADR 0018）。
   *
   * 以前のポリシーは JWT の app_metadata.role を見ていたため、降格・除名しても
   * 手元のトークンが失効するまで（最大1時間）元の権限で書けた。
   * ここではトークンを取り直さずに DB だけを変え、即時に効くことを確かめる。
   */
  describe('ロールは JWT claim ではなく DB のメンバーシップで判定する', () => {
    function claimsOf(accessToken: string) {
      const payload = accessToken.split('.')[1];
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        app_metadata?: { role?: string; org_id?: string };
      };
    }

    it('通常組織（is_demo = false）の admin は書き込める', async () => {
      const { data: org } = await admin
        .from('organizations')
        .select('is_demo')
        .eq('id', orgId)
        .single();
      expect(org?.is_demo).toBe(false);

      const { error } = await clients.admin.storage
        .from('avatars')
        .upload(`${orgId}/emp/avatar-admin-normal.png`, pngBlob(), { upsert: true });

      expect(error).toBeNull();
      await admin.storage.from('avatars').remove([`${orgId}/emp/avatar-admin-normal.png`]);
    });

    it('DB で member に降格済みなら、JWT claim が admin のままでも書けない', async () => {
      const client = await createMember(orgId, 'admin', 'demoted');
      const userId = userIds[userIds.length - 1];

      await admin
        .from('memberships')
        .update({ role: 'member' })
        .eq('user_id', userId)
        .eq('org_id', orgId);

      // 前提: トークンは降格前に発行されたもので、claim はまだ admin。
      const { data: session } = await client.auth.getSession();
      expect(claimsOf(session.session!.access_token).app_metadata?.role).toBe('admin');

      const { error } = await client.storage
        .from('avatars')
        .upload(`${orgId}/emp/avatar-demoted.png`, pngBlob());
      expect(error).not.toBeNull();

      await admin.storage
        .from('avatars')
        .upload(`${orgId}/seed/avatar.png`, pngBlob(), { upsert: true });
      const { data: removed } = await client.storage
        .from('avatars')
        .remove([`${orgId}/seed/avatar.png`]);
      expect(removed ?? []).toHaveLength(0);
    });

    it('DB でメンバーから外されたら、JWT claim が残っていても読めない', async () => {
      const client = await createMember(orgId, 'viewer', 'removed');
      const userId = userIds[userIds.length - 1];

      await admin.from('memberships').delete().eq('user_id', userId).eq('org_id', orgId);

      const { data: session } = await client.auth.getSession();
      expect(claimsOf(session.session!.access_token).app_metadata?.org_id).toBe(orgId);

      await admin.storage
        .from('avatars')
        .upload(`${orgId}/seed/avatar.png`, pngBlob(), { upsert: true });

      // RLS で見えないオブジェクトは list から黙って除外される。
      const { data } = await client.storage.from('avatars').list(`${orgId}/seed`);
      expect(data ?? []).toHaveLength(0);
    });
  });

  /**
   * デモ組織の書き込み禁止（20260829000001 / ADR 0012）。
   *
   * デモの owner / admin の資格情報は README で公開している。Service Layer の
   * authorize() はデモへの書き込みを拒否するが、Storage は Service Layer を
   * 経由しないため、ポリシー側にも同じ禁止が要る。
   */
  describe('デモ組織（is_demo = true）', () => {
    let demoOrgId: string;
    let demoOwner: SupabaseClient;

    beforeAll(async () => {
      const { data: demo } = await admin
        .from('organizations')
        .insert({ name: `Demo ${testId}`, slug: `demo-${testId}`, is_demo: true })
        .select()
        .single();
      demoOrgId = demo!.id;
      demoOwner = await createMember(demoOrgId, 'owner', 'demo-owner');

      await admin.storage
        .from('avatars')
        .upload(`${demoOrgId}/seed/avatar.png`, pngBlob(), { upsert: true });
    }, 30_000);

    afterAll(async () => {
      await admin.storage.from('avatars').remove([`${demoOrgId}/seed/avatar.png`]);
      await admin.rpc('purge_organization', { p_org_id: demoOrgId });
    });

    it('owner でもアップロードできない', async () => {
      const { error } = await demoOwner.storage
        .from('avatars')
        .upload(`${demoOrgId}/emp/avatar.png`, pngBlob());

      expect(error).not.toBeNull();
    });

    it('owner でも既存のアバターを上書きできない', async () => {
      const { error } = await demoOwner.storage
        .from('avatars')
        .upload(`${demoOrgId}/seed/avatar.png`, pngBlob(), { upsert: true });

      expect(error).not.toBeNull();
    });

    it('owner でも既存のアバターを削除できない', async () => {
      const { data } = await demoOwner.storage
        .from('avatars')
        .remove([`${demoOrgId}/seed/avatar.png`]);

      expect(data ?? []).toHaveLength(0);

      const { data: still } = await admin.storage.from('avatars').list(`${demoOrgId}/seed`);
      expect(still?.map((o) => o.name)).toContain('avatar.png');
    });

    it('閲覧はできる', async () => {
      // デモは「見てもらう」ための組織。参照まで塞ぐと画面が壊れる。
      const { data, error } = await demoOwner.storage.from('avatars').list(`${demoOrgId}/seed`);

      expect(error).toBeNull();
      expect(data?.map((o) => o.name)).toContain('avatar.png');
    });
  });
});
