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
  const evaluation = (
    over: Partial<{ evaluatorId: string; employeeId: string; status: string }> = {},
  ) => ({
    evaluatorId: 'evaluator',
    employeeId: 'subject',
    status: 'submitted',
    ...over,
  });

  it('admin 以上は評価者・被評価者に関わらず見られる', () => {
    expect(canReadEvaluationComment(ctxOf('admin'), evaluation(), null)).toBe(true);
    expect(canReadEvaluationComment(ctxOf('owner'), evaluation(), 'me')).toBe(true);
  });

  it('自分が評価者なら状態に関わらず見られる', () => {
    // 書いた本人なので下書き段階でも隠す理由が無い。
    for (const status of ['draft', 'in_progress', 'submitted', 'confirmed', 'returned']) {
      expect(
        canReadEvaluationComment(ctxOf('member'), evaluation({ evaluatorId: 'me', status }), 'me'),
      ).toBe(true);
    }
  });

  it('自分が被評価者なら確定後だけ見られる', () => {
    expect(
      canReadEvaluationComment(
        ctxOf('member'),
        evaluation({ employeeId: 'me', status: 'confirmed' }),
        'me',
      ),
    ).toBe(true);
  });

  /**
   * 確定前のコメントは本人に流さない。書き手が推敲できないまま
   * 評価が伝わってしまうため。確定への遷移は admin 以上に限定してある。
   */
  it.each(['draft', 'in_progress', 'submitted', 'returned'])(
    '被評価者本人でも %s の段階では見られない',
    (status) => {
      expect(
        canReadEvaluationComment(ctxOf('member'), evaluation({ employeeId: 'me', status }), 'me'),
      ).toBe(false);
    },
  );

  it('当事者でなければ確定済みでも見られない', () => {
    expect(
      canReadEvaluationComment(ctxOf('member'), evaluation({ status: 'confirmed' }), 'me'),
    ).toBe(false);
  });

  /**
   * 未紐付けはどの id とも一致しない。ここが true になると、
   * 紐付け前のユーザーに全社の評価コメントが開く。
   */
  it('紐付いていない member は確定済みでも見られない', () => {
    expect(
      canReadEvaluationComment(
        ctxOf('member'),
        evaluation({ employeeId: 'someone', status: 'confirmed' }),
        null,
      ),
    ).toBe(false);
  });

  it('viewer も同じ規則に従う', () => {
    expect(
      canReadEvaluationComment(
        ctxOf('viewer'),
        evaluation({ employeeId: 'me', status: 'confirmed' }),
        'me',
      ),
    ).toBe(true);
    expect(canReadEvaluationComment(ctxOf('viewer'), evaluation({ employeeId: 'me' }), 'me')).toBe(
      false,
    );
  });
});
