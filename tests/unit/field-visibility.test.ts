import { describe, expect, it } from 'vitest';

import type { AuthContext, Role } from '@/services/auth-context';
import {
  canReadBirthDate,
  canReadEvaluationComment,
  canReadPersonalData,
} from '@/services/field-visibility';

function ctxOf(role: Role, userId = 'user-1'): AuthContext {
  return { userId, orgId: 'org-1', role };
}

describe('canReadPersonalData', () => {
  it.each<[Role, boolean]>([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('%s → %s', (role, expected) => {
    expect(canReadPersonalData(ctxOf(role))).toBe(expected);
  });
});

describe('canReadBirthDate', () => {
  it('admin 以上は他人の生年月日も見られる', () => {
    expect(canReadBirthDate(ctxOf('admin'), 'someone-else')).toBe(true);
    expect(canReadBirthDate(ctxOf('owner'), null)).toBe(true);
  });

  it('member は自分の従業員レコードなら見られる', () => {
    expect(canReadBirthDate(ctxOf('member', 'user-9'), 'user-9')).toBe(true);
  });

  it('member は他人の生年月日を見られない', () => {
    expect(canReadBirthDate(ctxOf('member', 'user-9'), 'user-8')).toBe(false);
  });

  /**
   * 未紐付けの従業員は誰の「本人」でもない。ここが true になると、
   * user_id が空のレコード＝マスタ登録直後の全従業員が member に開く。
   */
  it('未紐付け（user_id が null）の従業員は member から見えない', () => {
    expect(canReadBirthDate(ctxOf('member', 'user-9'), null)).toBe(false);
  });

  it('viewer も本人であれば見られる', () => {
    expect(canReadBirthDate(ctxOf('viewer', 'user-9'), 'user-9')).toBe(true);
    expect(canReadBirthDate(ctxOf('viewer', 'user-9'), 'user-8')).toBe(false);
  });
});

describe('canReadEvaluationComment', () => {
  it('admin 以上は評価者に関わらず見られる', () => {
    expect(canReadEvaluationComment(ctxOf('admin'), 'e2', null)).toBe(true);
    expect(canReadEvaluationComment(ctxOf('owner'), 'e2', 'e1')).toBe(true);
  });

  it('member は自分が評価者の評価だけ見られる', () => {
    expect(canReadEvaluationComment(ctxOf('member'), 'me', 'me')).toBe(true);
    expect(canReadEvaluationComment(ctxOf('member'), 'someone-else', 'me')).toBe(false);
  });

  /**
   * 被評価者本人にも見せない。評価の確定・開示フローが無い以上、
   * 下書き段階のコメントが本人に流れる方が事故が大きい。
   */
  it('紐付いていない member は誰の評価コメントも見られない', () => {
    expect(canReadEvaluationComment(ctxOf('member'), 'e2', null)).toBe(false);
  });

  it('viewer は自分が評価者になり得ないので実質すべて見えない', () => {
    expect(canReadEvaluationComment(ctxOf('viewer'), 'e2', null)).toBe(false);
  });
});
