import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CycleDetailView } from '@/app/(dashboard)/evaluations/cycle-detail-view';
import type { CycleStatus, CycleWithEvaluations, Evaluation } from '@/types/evaluation';

// 子ダイアログは自前のフォーム・Server Action を抱えるため差し替える。
// この画面の関心は一覧の描画と空状態であって、ダイアログの中身ではない。
vi.mock('@/app/(dashboard)/evaluations/evaluation-form-dialog', () => ({
  EvaluationFormDialog: () => null,
}));
vi.mock('@/app/(dashboard)/evaluations/evaluation-edit-dialog', () => ({
  EvaluationEditDialog: () => null,
}));
vi.mock('@/app/(dashboard)/evaluations/evaluation-delete-dialog', () => ({
  EvaluationDeleteDialog: () => null,
}));

function makeEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: 'e-1',
    cycleId: 'c-1',
    employeeId: 'emp-1',
    employeeName: '山田 太郎',
    employeeCode: 'E-001',
    evaluatorId: 'emp-2',
    evaluatorName: '佐藤 花子',
    ratings: { achievement: 4, teamwork: 5 },
    comment: '期待を上回る成果',
    status: 'confirmed',
    createdAt: new Date('2025-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDetail(
  evaluations: Evaluation[],
  cycleStatus: CycleStatus = 'in_progress',
): CycleWithEvaluations {
  return {
    cycle: {
      id: 'c-1',
      name: '2025年上期評価',
      periodStart: '2025-04-01',
      periodEnd: '2025-09-30',
      status: cycleStatus,
      createdAt: new Date('2025-04-01T00:00:00Z'),
      updatedAt: new Date('2025-04-01T00:00:00Z'),
    },
    evaluations,
  };
}

function renderView(detail: CycleWithEvaluations, onBack = vi.fn()) {
  render(<CycleDetailView detail={detail} employees={[]} onBack={onBack} onRefresh={vi.fn()} />);
  return { onBack };
}

describe('CycleDetailView', () => {
  it('サイクル名と期間を表示する', () => {
    renderView(makeDetail([makeEvaluation()]));

    expect(screen.getByRole('heading', { name: '2025年上期評価' })).toBeInTheDocument();
    expect(screen.getByText('2025-04-01 〜 2025-09-30')).toBeInTheDocument();
  });

  it('評価が0件のとき、空状態とCTAを表示し件数を0と示す', () => {
    renderView(makeDetail([]));

    expect(screen.getByText('まだ評価が追加されていません')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最初の評価を追加' })).toBeInTheDocument();
    expect(screen.getByText('評価一覧（0 件）')).toBeInTheDocument();
  });

  it('評価があるとき、空状態を出さず件数を件数どおりに表示する', () => {
    renderView(makeDetail([makeEvaluation({ id: 'a' }), makeEvaluation({ id: 'b' })]));

    expect(screen.queryByText('まだ評価が追加されていません')).not.toBeInTheDocument();
    expect(screen.getByText('評価一覧（2 件）')).toBeInTheDocument();
  });

  it('評価行に従業員名・社員番号・評価者を表示する', () => {
    renderView(makeDetail([makeEvaluation()]));

    expect(screen.getByText('山田 太郎')).toBeInTheDocument();
    expect(screen.getByText('(E-001)')).toBeInTheDocument();
    expect(screen.getByText('評価者: 佐藤 花子')).toBeInTheDocument();
  });

  it('コメントがマスクされて null のとき、評価行は残したままコメントだけ落とす', () => {
    renderView(makeDetail([makeEvaluation({ comment: null })]));

    expect(screen.getByText('山田 太郎')).toBeInTheDocument();
    expect(screen.queryByText('期待を上回る成果')).not.toBeInTheDocument();
  });

  it('評点の平均を小数第1位まで表示する', () => {
    renderView(makeDetail([makeEvaluation({ ratings: { a: 4, b: 5 } })]));

    expect(screen.getByText('平均 4.5')).toBeInTheDocument();
  });

  it('評点が null のとき平均を表示しない', () => {
    renderView(makeDetail([makeEvaluation({ ratings: null })]));

    expect(screen.queryByText(/平均/)).not.toBeInTheDocument();
  });

  it('評点が空オブジェクトのとき、0除算の NaN を出さず平均を表示しない', () => {
    renderView(makeDetail([makeEvaluation({ ratings: {} })]));

    expect(screen.queryByText(/平均/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('評価ステータスを日本語ラベルに変換する', () => {
    renderView(
      makeDetail([
        makeEvaluation({ id: 'a', status: 'draft' }),
        makeEvaluation({ id: 'b', status: 'in_progress' }),
        makeEvaluation({ id: 'c', status: 'submitted' }),
        makeEvaluation({ id: 'd', status: 'confirmed' }),
        makeEvaluation({ id: 'e', status: 'returned' }),
      ]),
    );

    expect(screen.getByText('下書き')).toBeInTheDocument();
    expect(screen.getByText('入力中')).toBeInTheDocument();
    expect(screen.getByText('提出済')).toBeInTheDocument();
    expect(screen.getByText('確定')).toBeInTheDocument();
    expect(screen.getByText('差戻し')).toBeInTheDocument();
  });

  it('サイクルのステータス（下書き/進行中/完了）をラベルに変換する', () => {
    for (const [status, label] of [
      ['draft', '下書き'],
      ['in_progress', '進行中'],
      ['completed', '完了'],
    ] as const) {
      const { unmount } = render(
        <CycleDetailView
          detail={makeDetail([], status)}
          employees={[]}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('戻るボタンを押すと onBack を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onBack } = renderView(makeDetail([]));

    // 先頭のボタンが戻る矢印
    await user.click(screen.getAllByRole('button')[0]!);

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
