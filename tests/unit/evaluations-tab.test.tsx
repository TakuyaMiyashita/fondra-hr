import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EvaluationsTab } from '@/app/(dashboard)/employees/[id]/tabs/evaluations-tab';
import type { EvaluationRow } from '@/types/employee';

import { renderWithQuery } from '../helpers/render-with-query';

const fetchEmployeeEvaluations = vi.hoisted(() => vi.fn());

vi.mock('@/app/(dashboard)/employees/actions', () => ({
  fetchEmployeeEvaluations,
}));

const EMPLOYEE_ID = '11111111-1111-1111-1111-111111111111';

function makeEvaluation(overrides: Partial<EvaluationRow> = {}): EvaluationRow {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    cycleName: '2025年上期',
    evaluatorName: '佐藤 花子',
    status: 'confirmed',
    comment: '目標を大きく上回る成果',
    createdAt: new Date('2025-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('EvaluationsTab', () => {
  beforeEach(() => {
    fetchEmployeeEvaluations.mockReset();
  });

  it('取得中はスケルトンを表示し、評価の見出しは出さない', () => {
    fetchEmployeeEvaluations.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    expect(screen.queryByText('評価記録がありません')).not.toBeInTheDocument();
  });

  it('評価があるとき、サイクル名・評価者・コメントを表示する', async () => {
    fetchEmployeeEvaluations.mockResolvedValue([makeEvaluation()]);

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('2025年上期')).toBeInTheDocument();
    expect(screen.getByText('評価者: 佐藤 花子')).toBeInTheDocument();
    expect(screen.getByText('目標を大きく上回る成果')).toBeInTheDocument();
  });

  it('コメントがマスクされて null のとき、評価自体は表示したままコメント欄だけ落とす', async () => {
    fetchEmployeeEvaluations.mockResolvedValue([makeEvaluation({ comment: null })]);

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    // 「コメントが見えない」は「評価が存在しない」ではない。行自体は残る
    expect(await screen.findByText('2025年上期')).toBeInTheDocument();
    expect(screen.getByText('評価者: 佐藤 花子')).toBeInTheDocument();
    expect(screen.queryByText('目標を大きく上回る成果')).not.toBeInTheDocument();
    expect(screen.queryByText('評価記録がありません')).not.toBeInTheDocument();
  });

  it('権限が無く空配列が返るとき、空状態を表示する', async () => {
    // Server Action は AuthorizationError を空配列に変換して返す
    fetchEmployeeEvaluations.mockResolvedValue([]);

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('評価記録がありません')).toBeInTheDocument();
    expect(screen.getByText('この従業員の評価記録はまだ登録されていません。')).toBeInTheDocument();
  });

  it('取得が失敗して data が undefined のときも空状態にフォールバックする', async () => {
    fetchEmployeeEvaluations.mockRejectedValue(new Error('boom'));

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('評価記録がありません')).toBeInTheDocument();
  });

  it('ステータスを日本語ラベルに変換する', async () => {
    fetchEmployeeEvaluations.mockResolvedValue([
      makeEvaluation({ id: 'a', status: 'draft' }),
      makeEvaluation({ id: 'b', status: 'in_progress' }),
      makeEvaluation({ id: 'c', status: 'submitted' }),
      makeEvaluation({ id: 'd', status: 'confirmed' }),
      makeEvaluation({ id: 'e', status: 'returned' }),
    ]);

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('下書き')).toBeInTheDocument();
    expect(screen.getByText('進行中')).toBeInTheDocument();
    expect(screen.getByText('提出済み')).toBeInTheDocument();
    expect(screen.getByText('確定')).toBeInTheDocument();
    expect(screen.getByText('差戻し')).toBeInTheDocument();
  });

  it('未知のステータスは変換せず生の値をそのまま表示する', async () => {
    fetchEmployeeEvaluations.mockResolvedValue([makeEvaluation({ status: 'unknown_status' })]);

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('unknown_status')).toBeInTheDocument();
  });

  it('従業員IDを引数に取得する', async () => {
    fetchEmployeeEvaluations.mockResolvedValue([]);

    renderWithQuery(<EvaluationsTab employeeId={EMPLOYEE_ID} />);

    await waitFor(() => expect(fetchEmployeeEvaluations).toHaveBeenCalledWith(EMPLOYEE_ID));
  });
});
