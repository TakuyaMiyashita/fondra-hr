import { describe, expect, it } from 'vitest';
import type { ZodError } from 'zod';

import { auditLogListQuerySchema } from '@/lib/validations/audit-log';
import {
  createDepartmentSchema,
  moveDepartmentSchema,
  updateDepartmentSchema,
} from '@/lib/validations/department';
import { changeRoleSchema, inviteMemberSchema, updateOrgSchema } from '@/lib/validations/settings';

/**
 * Zod スキーマは宣言的なので、モジュールを import しただけで
 * カバレッジ上は 100% と表示される。実際に検証ルールが機能しているかは
 * 数値に一切現れないため、ここで明示的に境界値と不正入力を通す。
 *
 * これらのスキーマは「UI から届いた未検証の値」を最初に受け取る境界であり、
 * エラーメッセージはそのまま toast に出るため実質的な仕様でもある。
 */

function issuesByPath(error: ZodError): Record<string, { code: string; message: string }> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.join('.'),
      { code: issue.code as string, message: issue.message },
    ]),
  );
}

const VALID_UUID = '3f9d2c1a-5b6e-4c7d-8e9f-0a1b2c3d4e5f';

describe('auditLogListQuerySchema', () => {
  it('空の入力に既定値を適用する', () => {
    // 監査ログ画面は初回描画でクエリを渡さない。既定値が入らないと
    // page=undefined で offset 計算が NaN になる。
    const result = auditLogListQuerySchema.safeParse({});

    expect(result.data).toEqual({ page: 1, perPage: 20, order: 'desc' });
  });

  it('クエリ文字列由来の数値を強制変換する', () => {
    // URL のクエリは常に文字列で届くため coerce が必須。
    const result = auditLogListQuerySchema.safeParse({ page: '3', perPage: '50' });

    expect(result.data).toMatchObject({ page: 3, perPage: 50 });
  });

  it('page は 1 以上（0 と負数を弾く）', () => {
    expect(auditLogListQuerySchema.safeParse({ page: 1 }).success).toBe(true);
    expect(auditLogListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(auditLogListQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('perPage は 1〜100（境界値と超過）', () => {
    // 上限が無いと 1 リクエストで全件取得され、DB とメモリを圧迫する。
    expect(auditLogListQuerySchema.safeParse({ perPage: 1 }).success).toBe(true);
    expect(auditLogListQuerySchema.safeParse({ perPage: 100 }).success).toBe(true);
    expect(auditLogListQuerySchema.safeParse({ perPage: 101 }).success).toBe(false);
    expect(auditLogListQuerySchema.safeParse({ perPage: 0 }).success).toBe(false);
  });

  it('page / perPage の小数を弾く', () => {
    expect(auditLogListQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(auditLogListQuerySchema.safeParse({ perPage: 20.5 }).success).toBe(false);
  });

  it('数値に変換できない文字列を弾く', () => {
    expect(auditLogListQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('order は asc / desc のみ', () => {
    expect(auditLogListQuerySchema.safeParse({ order: 'asc' }).data?.order).toBe('asc');
    expect(auditLogListQuerySchema.safeParse({ order: 'ASC' }).success).toBe(false);
  });

  it('resourceType / action は任意の文字列を許容する', () => {
    // フィルタ値は DB から動的に来るため enum で縛っていない。
    // Service 層で org_id スコープのクエリに渡るだけなので、
    // 未知の値が来ても該当0件になるだけで害はない。
    const result = auditLogListQuerySchema.safeParse({
      resourceType: 'employee',
      action: 'employee.create',
    });

    expect(result.success).toBe(true);
  });
});

describe('createDepartmentSchema', () => {
  it('部署名だけで作成できる（親は任意）', () => {
    expect(createDepartmentSchema.safeParse({ name: '開発部' }).success).toBe(true);
  });

  it('部署名の空文字を専用メッセージで弾く', () => {
    const result = createDepartmentSchema.safeParse({ name: '' });

    expect(issuesByPath(result.error!)['name']).toEqual({
      code: 'too_small',
      message: '部署名を入力してください',
    });
  });

  it('部署名は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
    expect(createDepartmentSchema.safeParse({ name: 'x'.repeat(100) }).success).toBe(true);

    const tooLong = createDepartmentSchema.safeParse({ name: 'x'.repeat(101) });
    expect(issuesByPath(tooLong.error!)['name']).toEqual({
      code: 'too_big',
      message: '部署名は100文字以内で入力してください',
    });
  });

  it('parentId の空文字を「親なし」として許容する', () => {
    // フォームの未選択は空文字で届く。ここを弾くとトップレベル部署が作れない。
    expect(createDepartmentSchema.safeParse({ name: '開発部', parentId: '' }).success).toBe(true);
  });

  it('parentId が UUID でなければ弾く', () => {
    const result = createDepartmentSchema.safeParse({ name: '開発部', parentId: 'dept-1' });

    expect(result.success).toBe(false);
  });

  it('name 未指定を弾く', () => {
    expect(createDepartmentSchema.safeParse({}).success).toBe(false);
  });
});

describe('updateDepartmentSchema', () => {
  it('id だけで通る（name は任意の部分更新）', () => {
    expect(updateDepartmentSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  it('name を渡す場合は空文字を弾く', () => {
    // 「任意」であることと「空文字を許す」ことは別。
    // 送るなら妥当な値でなければならない。
    const result = updateDepartmentSchema.safeParse({ id: VALID_UUID, name: '' });

    expect(issuesByPath(result.error!)['name'].message).toBe('部署名を入力してください');
  });

  it('id が UUID でなければ弾く', () => {
    expect(updateDepartmentSchema.safeParse({ id: 'dept-1' }).success).toBe(false);
  });

  it('id 未指定を弾く', () => {
    expect(updateDepartmentSchema.safeParse({ name: '開発部' }).success).toBe(false);
  });
});

describe('moveDepartmentSchema', () => {
  it('newParentId に null を許容する（ルートへ移動）', () => {
    // D&D でルート領域にドロップしたときの表現。
    // ここを弾くと階層から出せなくなる。
    const result = moveDepartmentSchema.safeParse({ id: VALID_UUID, newParentId: null });

    expect(result.data).toEqual({ id: VALID_UUID, newParentId: null });
  });

  it('newParentId に UUID を許容する', () => {
    const other = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
    expect(moveDepartmentSchema.safeParse({ id: VALID_UUID, newParentId: other }).success).toBe(
      true,
    );
  });

  it('newParentId の空文字は弾く（null と区別する）', () => {
    // 空文字を通すと Service 側で「親なし」とも「不正な ID」とも解釈でき、
    // 意図が曖昧になる。ルートへの移動は必ず null で表す。
    expect(moveDepartmentSchema.safeParse({ id: VALID_UUID, newParentId: '' }).success).toBe(false);
  });

  it('newParentId の省略を弾く（明示的に null を要求する）', () => {
    expect(moveDepartmentSchema.safeParse({ id: VALID_UUID }).success).toBe(false);
  });
});

describe('updateOrgSchema', () => {
  it('組織名の空文字を専用メッセージで弾く', () => {
    const result = updateOrgSchema.safeParse({ name: '' });

    expect(issuesByPath(result.error!)['name']).toEqual({
      code: 'too_small',
      message: '組織名を入力してください',
    });
  });

  it('組織名は100文字ちょうどまで、101文字で弾かれる（境界値）', () => {
    expect(updateOrgSchema.safeParse({ name: 'x'.repeat(100) }).success).toBe(true);
    expect(updateOrgSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });

  it('name 未指定を弾く', () => {
    expect(updateOrgSchema.safeParse({}).success).toBe(false);
  });
});

describe('inviteMemberSchema', () => {
  it.each(['admin', 'member', 'viewer'])('ロール %s を招待できる', (role) => {
    expect(inviteMemberSchema.safeParse({ email: 'a@example.com', role }).success).toBe(true);
  });

  it('owner を招待できない（権限昇格の防止）', () => {
    // owner は組織作成者のみ。招待経由で増やせると、
    // 管理者が自分を降格できない状態や乗っ取りが起こりうる。
    const result = inviteMemberSchema.safeParse({ email: 'a@example.com', role: 'owner' });

    expect(result.success).toBe(false);
    expect(issuesByPath(result.error!)['role'].message).toBe('ロールを選択してください');
  });

  it('未知のロールを弾く', () => {
    expect(inviteMemberSchema.safeParse({ email: 'a@example.com', role: 'root' }).success).toBe(
      false,
    );
  });

  it.each([
    ['@ なし', 'not-an-email'],
    ['ローカル部なし', '@example.com'],
    ['ドメインなし', 'user@'],
    ['空文字', ''],
  ])('不正なメールアドレスを弾く: %s', (_label, email) => {
    const result = inviteMemberSchema.safeParse({ email, role: 'member' });

    expect(result.success).toBe(false);
    expect(issuesByPath(result.error!)['email'].message).toBe(
      '有効なメールアドレスを入力してください',
    );
  });

  it('role 未指定を弾く', () => {
    expect(inviteMemberSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
  });
});

describe('changeRoleSchema', () => {
  it.each(['admin', 'member', 'viewer'])('ロール %s へ変更できる', (role) => {
    expect(changeRoleSchema.safeParse({ membershipId: VALID_UUID, role }).success).toBe(true);
  });

  it('owner へ変更できない（権限昇格の防止）', () => {
    // 招待と同じ理由。UI 側でも owner は選択肢に出していないが、
    // Server Action は公開エンドポイントなのでスキーマ側でも塞ぐ。
    expect(changeRoleSchema.safeParse({ membershipId: VALID_UUID, role: 'owner' }).success).toBe(
      false,
    );
  });

  it('membershipId が UUID でなければ弾く', () => {
    expect(changeRoleSchema.safeParse({ membershipId: 'm-1', role: 'member' }).success).toBe(false);
  });

  it('membershipId 未指定を弾く', () => {
    expect(changeRoleSchema.safeParse({ role: 'member' }).success).toBe(false);
  });
});
