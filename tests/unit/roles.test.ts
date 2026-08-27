import { describe, expect, it } from 'vitest';

import { roleAtLeast } from '@/lib/roles';
import type { Role } from '@/services/auth-context';

/**
 * ロール階層はサーバー（authorize）とクライアント（ボタンの出し分け）の
 * 両方が参照する。ここがずれると「押せるのにボタンが無い」
 * 「ボタンはあるが必ず失敗する」がすぐ生まれる。
 */
const ORDER: Role[] = ['viewer', 'member', 'admin', 'owner'];

describe('roleAtLeast', () => {
  it.each(ORDER)('%s は自分自身以上である', (role) => {
    expect(roleAtLeast(role, role)).toBe(true);
  });

  it('上位ロールは下位の要求を満たす', () => {
    for (let i = 0; i < ORDER.length; i++) {
      for (let j = 0; j <= i; j++) {
        expect(roleAtLeast(ORDER[i], ORDER[j])).toBe(true);
      }
    }
  });

  it('下位ロールは上位の要求を満たさない', () => {
    for (let i = 0; i < ORDER.length; i++) {
      for (let j = i + 1; j < ORDER.length; j++) {
        expect(roleAtLeast(ORDER[i], ORDER[j])).toBe(false);
      }
    }
  });

  it('順序は viewer < member < admin < owner', () => {
    // 具体例で固定する。総当たりだけだと、順序を丸ごと逆にしても通ってしまう。
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'owner')).toBe(false);
    expect(roleAtLeast('member', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'member')).toBe(false);
  });
});
