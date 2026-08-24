import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import {
  AuthorizationError,
  DEMO_READ_ONLY_MESSAGE,
  DemoReadOnlyError,
  authorizationMessage,
  authorize,
  hasMinRole,
} from '@/services/authorize';

const makeCtx = (role: AuthContext['role']): AuthContext => ({
  userId: 'user-1',
  orgId: 'org-1',
  role,
});

describe('authorize', () => {
  it('allows owner to perform any action', () => {
    expect(() => authorize(makeCtx('owner'), 'delete', 'employee')).not.toThrow();
  });

  it('allows admin to perform any action', () => {
    expect(() => authorize(makeCtx('admin'), 'create', 'employee')).not.toThrow();
  });

  it('allows member to read', () => {
    expect(() => authorize(makeCtx('member'), 'read', 'employee')).not.toThrow();
  });

  it('blocks viewer from write actions', () => {
    expect(() => authorize(makeCtx('viewer'), 'create', 'employee')).toThrow(AuthorizationError);
    expect(() => authorize(makeCtx('viewer'), 'update', 'employee')).toThrow(AuthorizationError);
    expect(() => authorize(makeCtx('viewer'), 'delete', 'employee')).toThrow(AuthorizationError);
  });

  it('allows viewer to read', () => {
    expect(() => authorize(makeCtx('viewer'), 'read', 'employee')).not.toThrow();
  });

  it('applies custom check function', () => {
    const denyAll = () => false;
    expect(() => authorize(makeCtx('admin'), 'update', 'employee', denyAll)).toThrow(
      AuthorizationError,
    );
  });
});

describe('hasMinRole', () => {
  it('checks role hierarchy correctly', () => {
    expect(hasMinRole(makeCtx('owner'), 'admin')).toBe(true);
    expect(hasMinRole(makeCtx('admin'), 'admin')).toBe(true);
    expect(hasMinRole(makeCtx('member'), 'admin')).toBe(false);
    expect(hasMinRole(makeCtx('viewer'), 'member')).toBe(false);
  });
});

describe('デモ組織の閲覧専用モード', () => {
  /**
   * README は owner を含む4ロールの資格情報を公開している。認可の効き方を
   * ロールごとに見せるのがデモの主目的なのでログインは開けておきたいが、
   * そのままだと誰でも従業員を全削除できる。
   *
   * そこでデモ組織への「書き込みだけ」を止める。読み取りは止めない
   * （生年月日のマスクや 1on1 の当事者限定という見せ場は読み取り側にある）。
   */
  const DEMO_ORG = 'f0d3a000-0000-4000-8000-000000000001';
  const demoCtx = (role: AuthContext['role']): AuthContext => ({
    userId: 'user-1',
    orgId: DEMO_ORG,
    role,
  });

  const WRITE_ACTIONS = ['create', 'update', 'delete'] as const;

  describe('環境変数が未設定のとき', () => {
    // ローカル開発・CI・テストは素通りする必要がある。
    // ここが漏れると、開発中に何も書き込めなくなる。
    it.each(WRITE_ACTIONS)('%s を通す', (action) => {
      expect(() => authorize(demoCtx('owner'), action, 'employee')).not.toThrow();
    });
  });

  describe('環境変数が設定されているとき', () => {
    beforeEach(() => {
      vi.stubEnv('DEMO_READONLY_ORG_ID', DEMO_ORG);
    });

    afterEach(() => {
      // 他のテストに漏らさない。漏れると原因の分かりにくい失敗になる。
      vi.unstubAllEnvs();
    });

    it.each(WRITE_ACTIONS)('デモ組織の %s は owner でも拒否する', (action) => {
      expect(() => authorize(demoCtx('owner'), action, 'employee')).toThrow(DemoReadOnlyError);
    });

    it.each(['owner', 'admin', 'member', 'viewer'] as const)(
      '%s でも結論は同じ（ロールに関係なく書けない）',
      (role) => {
        expect(() => authorize(demoCtx(role), 'delete', 'employee')).toThrow(DemoReadOnlyError);
      },
    );

    it('読み取りは止めない', () => {
      // ロール別の見え方を見せるのがデモの目的なので、read を塞ぐと本末転倒。
      expect(() => authorize(demoCtx('viewer'), 'read', 'employee')).not.toThrow();
    });

    it('別の組織の書き込みは通す', () => {
      // サインアップして自分の組織を作った人は、そちらには自由に書ける。
      // 凍るのはデモ組織だけ。
      const ownCtx: AuthContext = { userId: 'user-1', orgId: 'my-own-org', role: 'owner' };
      expect(() => authorize(ownCtx, 'delete', 'employee')).not.toThrow();
    });

    it('DemoReadOnlyError は AuthorizationError でもある', () => {
      // Server Action 側の catch は AuthorizationError を見ている。
      // 継承が切れると、デモの拒否が捕まらず 500 になる。
      try {
        authorize(demoCtx('owner'), 'delete', 'employee');
        expect.unreachable('拒否されるはず');
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError);
        expect(e).toBeInstanceOf(DemoReadOnlyError);
      }
    });
  });
});

describe('authorizationMessage', () => {
  it('デモの拒否は理由が分かる文言にする', () => {
    // owner でログインした人に「権限がありません」と出すと、
    // 認可が壊れているように見えてデモの趣旨と正反対になる。
    const message = authorizationMessage(new DemoReadOnlyError('delete', 'employee'));

    expect(message).toBe(DEMO_READ_ONLY_MESSAGE);
    expect(message).not.toContain('権限がありません');
  });

  it('ロール不足は従来どおりの文言', () => {
    expect(authorizationMessage(new AuthorizationError('delete', 'employee'))).toBe(
      '権限がありません',
    );
  });
});
