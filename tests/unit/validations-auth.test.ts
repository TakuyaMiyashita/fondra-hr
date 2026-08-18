import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';

import {
  acceptInviteSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  switchOrgSchema,
} from '@/lib/validations/auth';
import { changeRoleSchema, inviteMemberSchema, updateOrgSchema } from '@/lib/validations/settings';

// バリデーションエラーは「どのフィールドが」「どのメッセージで」落ちたかまで
// 検証しないと、別フィールドの偶発的なエラーでテストが通ってしまう。
// path をキーにした map に畳んで突き合わせる。
function issuesByPath(error: ZodError): Record<string, { code: string; message: string }> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.join('.'),
      { code: issue.code as string, message: issue.message },
    ]),
  );
}

const VALID_UUID = '3f9d2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5f';

describe('auth validations', () => {
  describe('signUpSchema', () => {
    it('組織名・メール・パスワードが揃っていれば通る', () => {
      const result = signUpSchema.safeParse({
        orgName: 'Fondra株式会社',
        email: 'hr@example.com',
        password: 'passw0rd',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        orgName: 'Fondra株式会社',
        email: 'hr@example.com',
        password: 'passw0rd',
      });
    });

    it('組織名の空文字を日本語メッセージで弾く（サインアップの必須項目）', () => {
      const result = signUpSchema.safeParse({
        orgName: '',
        email: 'hr@example.com',
        password: 'passw0rd',
      });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['orgName']).toEqual({
        code: 'too_small',
        message: '組織名を入力してください',
      });
    });

    it('組織名は100文字ちょうどまで通る（境界値・下側）', () => {
      const result = signUpSchema.safeParse({
        orgName: 'あ'.repeat(100),
        email: 'hr@example.com',
        password: 'passw0rd',
      });

      expect(result.success).toBe(true);
    });

    it('組織名101文字は弾く（境界値・上側。DB の varchar 溢れを防ぐ実質的な防波堤）', () => {
      const result = signUpSchema.safeParse({
        orgName: 'あ'.repeat(101),
        email: 'hr@example.com',
        password: 'passw0rd',
      });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['orgName']).toEqual({
        code: 'too_big',
        message: '組織名は100文字以内で入力してください',
      });
    });

    it('パスワードは8文字ちょうどで通り、7文字は弾かれる（境界値）', () => {
      expect(
        signUpSchema.safeParse({ orgName: 'A', email: 'a@example.com', password: '12345678' })
          .success,
      ).toBe(true);

      const short = signUpSchema.safeParse({
        orgName: 'A',
        email: 'a@example.com',
        password: '1234567',
      });
      expect(short.success).toBe(false);
      expect(issuesByPath(short.error!)['password']).toEqual({
        code: 'too_small',
        message: 'パスワードは8文字以上で入力してください',
      });
    });

    it.each([
      ['@ がない', 'notanemail'],
      ['ドメインなし', 'a@'],
      ['TLD なし', 'a@b'],
      ['前後に空白', ' a@b.com '],
      ['非ASCIIローカル部', 'あ@b.com'],
    ])('不正なメール形式を弾く: %s', (_label, email) => {
      const result = signUpSchema.safeParse({ orgName: 'A', email, password: 'passw0rd' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['email']).toEqual({
        code: 'invalid_format',
        message: '有効なメールアドレスを入力してください',
      });
    });

    it('プラス付きエイリアスやサブドメインは通す（正当なメールを誤って弾かないこと）', () => {
      expect(
        signUpSchema.safeParse({
          orgName: 'A',
          email: 'hr+tag@mail.example.co.jp',
          password: 'passw0rd',
        }).success,
      ).toBe(true);
    });

    it('全フィールド未指定なら3件すべてエラーになる（部分的に通さない）', () => {
      const result = signUpSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error!.issues).toHaveLength(3);
      // undefined は min(1) ではなく型チェックで落ちるため、
      // メッセージは日本語ではなく Zod 既定の英語になる（UI 表示上の既知の穴）。
      expect(issuesByPath(result.error!)['orgName'].code).toBe('invalid_type');
      expect(issuesByPath(result.error!)['email'].code).toBe('invalid_type');
      expect(issuesByPath(result.error!)['password'].code).toBe('invalid_type');
    });

    it('null は string として受け付けない（フォーム未入力の null 送信を弾く）', () => {
      const result = signUpSchema.safeParse({ orgName: null, email: null, password: null });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['orgName'].code).toBe('invalid_type');
    });
  });

  describe('signInSchema', () => {
    it('メールとパスワードが揃っていれば通る', () => {
      const result = signInSchema.safeParse({ email: 'hr@example.com', password: 'x' });

      expect(result.success).toBe(true);
    });

    it('パスワードは1文字でも通る（サインインでは長さ検証をしない＝既存ユーザーを締め出さない）', () => {
      expect(signInSchema.safeParse({ email: 'a@b.com', password: 'a' }).success).toBe(true);
    });

    it('パスワード空文字は専用メッセージで弾く', () => {
      const result = signInSchema.safeParse({ email: 'a@b.com', password: '' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['password']).toEqual({
        code: 'too_small',
        message: 'パスワードを入力してください',
      });
    });

    it('不正なメールを弾く', () => {
      const result = signInSchema.safeParse({ email: 'bad', password: 'x' });

      expect(issuesByPath(result.error!)['email'].message).toBe(
        '有効なメールアドレスを入力してください',
      );
    });
  });

  describe('resetPasswordSchema', () => {
    it('メールのみで通る', () => {
      const result = resetPasswordSchema.safeParse({ email: 'hr@example.com' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ email: 'hr@example.com' });
    });

    it('メール未指定を弾く（パスワード再発行の宛先が空になるのを防ぐ）', () => {
      const result = resetPasswordSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['email'].code).toBe('invalid_type');
    });

    it('不正なメールを日本語メッセージで弾く', () => {
      const result = resetPasswordSchema.safeParse({ email: 'a@' });

      expect(issuesByPath(result.error!)['email']).toEqual({
        code: 'invalid_format',
        message: '有効なメールアドレスを入力してください',
      });
    });
  });

  describe('acceptInviteSchema', () => {
    const valid = {
      invitationId: VALID_UUID,
      orgId: VALID_UUID,
      role: 'member',
      email: 'invitee@example.com',
      password: 'passw0rd',
      token: VALID_UUID,
    };

    it('正しい招待情報は通る', () => {
      const result = acceptInviteSchema.safeParse(valid);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(valid);
    });

    it.each(['owner', 'admin', 'member', 'viewer'])(
      '招待ロール %s を受け付ける（4ロールすべて有効）',
      (role) => {
        expect(acceptInviteSchema.safeParse({ ...valid, role }).success).toBe(true);
      },
    );

    it('定義外ロールを弾く（権限昇格につながるため最重要）', () => {
      const result = acceptInviteSchema.safeParse({ ...valid, role: 'superadmin' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['role'].code).toBe('invalid_value');
    });

    it.each([
      ['ハイフンなし', '3f9d2c1a5b6e4c7d8e9f0a1b2c3d4e5f'],
      ['桁不足', '3f9d2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5'],
      ['UUID ではない文字列', 'not-a-uuid'],
      ['空文字', ''],
    ])('トークンが UUID 形式でなければ弾く: %s', (_label, token) => {
      const result = acceptInviteSchema.safeParse({ ...valid, token });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['token'].code).toBe('invalid_format');
    });

    it('招待経由のパスワードも8文字以上を強制する（サインアップと同水準）', () => {
      const result = acceptInviteSchema.safeParse({ ...valid, password: '1234567' });

      expect(issuesByPath(result.error!)['password']).toEqual({
        code: 'too_small',
        message: 'パスワードは8文字以上で入力してください',
      });
    });

    it('全項目が不正なら6件すべて報告する（最初の1件で打ち切らない）', () => {
      const result = acceptInviteSchema.safeParse({
        invitationId: 'x',
        orgId: 'y',
        role: 'nope',
        email: 'z',
        password: '1',
        token: 'w',
      });

      expect(result.success).toBe(false);
      expect(result.error!.issues).toHaveLength(6);
    });
  });

  describe('switchOrgSchema', () => {
    it('UUID を受け付ける（大文字表記も許容）', () => {
      expect(switchOrgSchema.safeParse({ orgId: VALID_UUID }).success).toBe(true);
      expect(switchOrgSchema.safeParse({ orgId: VALID_UUID.toUpperCase() }).success).toBe(true);
    });

    it('UUID 以外を専用メッセージで弾く（組織切替はテナント境界そのもの）', () => {
      const result = switchOrgSchema.safeParse({ orgId: 'org-1' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['orgId']).toEqual({
        code: 'invalid_format',
        message: '無効な組織IDです',
      });
    });

    it('未指定を弾く', () => {
      const result = switchOrgSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['orgId'].code).toBe('invalid_type');
    });
  });
});

describe('settings validations', () => {
  describe('updateOrgSchema', () => {
    it('組織名を受け付ける', () => {
      expect(updateOrgSchema.safeParse({ name: 'Fondra' }).success).toBe(true);
    });

    it('100文字ちょうどは通り、101文字は弾かれる（境界値）', () => {
      expect(updateOrgSchema.safeParse({ name: 'x'.repeat(100) }).success).toBe(true);

      const tooLong = updateOrgSchema.safeParse({ name: 'x'.repeat(101) });
      expect(issuesByPath(tooLong.error!)['name']).toEqual({
        code: 'too_big',
        message: '組織名は100文字以内で入力してください',
      });
    });

    it('空文字を弾く（組織名が空のまま保存されるのを防ぐ）', () => {
      const result = updateOrgSchema.safeParse({ name: '' });

      expect(issuesByPath(result.error!)['name']).toEqual({
        code: 'too_small',
        message: '組織名を入力してください',
      });
    });
  });

  describe('inviteMemberSchema', () => {
    it.each(['admin', 'member', 'viewer'])('ロール %s の招待を受け付ける', (role) => {
      const result = inviteMemberSchema.safeParse({ email: 'a@example.com', role });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ email: 'a@example.com', role });
    });

    it('owner での招待を弾く（owner は招待では作らせない設計）', () => {
      const result = inviteMemberSchema.safeParse({ email: 'a@example.com', role: 'owner' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['role']).toEqual({
        code: 'invalid_value',
        message: 'ロールを選択してください',
      });
    });

    it('ロール未指定でも日本語メッセージを返す（enum の message オプションが未指定にも効く）', () => {
      const result = inviteMemberSchema.safeParse({ email: 'a@example.com' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['role'].message).toBe('ロールを選択してください');
    });

    it('不正なメール宛の招待を弾く（外部への誤送信防止）', () => {
      const result = inviteMemberSchema.safeParse({ email: 'not-an-email', role: 'member' });

      expect(issuesByPath(result.error!)['email']).toEqual({
        code: 'invalid_format',
        message: '有効なメールアドレスを入力してください',
      });
    });
  });

  describe('changeRoleSchema', () => {
    it.each(['admin', 'member', 'viewer'])('ロール %s への変更を受け付ける', (role) => {
      expect(changeRoleSchema.safeParse({ membershipId: VALID_UUID, role }).success).toBe(true);
    });

    it('owner への昇格を弾く（オーナー移譲は別フローであるべき）', () => {
      const result = changeRoleSchema.safeParse({ membershipId: VALID_UUID, role: 'owner' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['role'].code).toBe('invalid_value');
    });

    it('membershipId が UUID でなければ弾く', () => {
      const result = changeRoleSchema.safeParse({ membershipId: '123', role: 'admin' });

      expect(result.success).toBe(false);
      expect(issuesByPath(result.error!)['membershipId'].code).toBe('invalid_format');
    });
  });
});
