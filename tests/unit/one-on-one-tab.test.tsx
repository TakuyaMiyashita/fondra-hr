import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OneOnOneTab } from '@/app/(dashboard)/employees/[id]/tabs/one-on-one-tab';
import type { OneOnOneRow } from '@/types/employee';

import { renderWithQuery } from '../helpers/render-with-query';

const fetchEmployeeOneOnOnes = vi.hoisted(() => vi.fn());

vi.mock('@/app/(dashboard)/employees/actions', () => ({
  fetchEmployeeOneOnOnes,
}));

const EMPLOYEE_ID = '11111111-1111-1111-1111-111111111111';

function makeRecord(overrides: Partial<OneOnOneRow> = {}): OneOnOneRow {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    heldOn: '2025-06-01',
    interviewerName: '佐藤 花子',
    notes: '来期の目標について合意した',
    aiSummary: null,
    moodScore: 4,
    ...overrides,
  };
}

describe('OneOnOneTab', () => {
  beforeEach(() => {
    fetchEmployeeOneOnOnes.mockReset();
  });

  it('取得中はスケルトンを表示する', () => {
    fetchEmployeeOneOnOnes.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });

  it('記録があるとき、実施日・面談者・メモを表示する', async () => {
    fetchEmployeeOneOnOnes.mockResolvedValue([makeRecord()]);

    renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('2025-06-01')).toBeInTheDocument();
    expect(screen.getByText('面談者: 佐藤 花子')).toBeInTheDocument();
    expect(screen.getByText('来期の目標について合意した')).toBeInTheDocument();
  });

  it('メモがマスクされて null のとき、記録行は残したままメモだけ落とす', async () => {
    fetchEmployeeOneOnOnes.mockResolvedValue([makeRecord({ notes: null })]);

    renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('2025-06-01')).toBeInTheDocument();
    expect(screen.getByText('面談者: 佐藤 花子')).toBeInTheDocument();
    expect(screen.queryByText('来期の目標について合意した')).not.toBeInTheDocument();
    expect(screen.queryByText('1on1記録がありません')).not.toBeInTheDocument();
  });

  it('当事者以外には空配列が返り、空状態を表示する', async () => {
    // 1on1 の閲覧は当事者に限定されており、権限外では空配列になる
    fetchEmployeeOneOnOnes.mockResolvedValue([]);

    renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('1on1記録がありません')).toBeInTheDocument();
    expect(screen.getByText('この従業員の1on1記録はまだ登録されていません。')).toBeInTheDocument();
  });

  it('取得が失敗して data が undefined のときも空状態にフォールバックする', async () => {
    fetchEmployeeOneOnOnes.mockRejectedValue(new Error('boom'));

    renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    expect(await screen.findByText('1on1記録がありません')).toBeInTheDocument();
  });

  it('moodScore が null のときバッジを描画しない', async () => {
    fetchEmployeeOneOnOnes.mockResolvedValue([makeRecord({ moodScore: null })]);

    const { container } = renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    await screen.findByText('2025-06-01');
    expect(container.querySelectorAll('[data-slot="badge"]')).toHaveLength(0);
  });

  it('moodScore が 0 でもバッジを描画する（falsy と null を取り違えない）', async () => {
    fetchEmployeeOneOnOnes.mockResolvedValue([makeRecord({ moodScore: 0 })]);

    const { container } = renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    await screen.findByText('2025-06-01');
    expect(container.querySelectorAll('[data-slot="badge"]')).toHaveLength(1);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('moodScore の境界（2 / 3 / 4）でバッジの見た目を切り替える', async () => {
    fetchEmployeeOneOnOnes.mockResolvedValue([
      makeRecord({ id: 'a', heldOn: '2025-01-01', moodScore: 2 }),
      makeRecord({ id: 'b', heldOn: '2025-02-01', moodScore: 3 }),
      makeRecord({ id: 'c', heldOn: '2025-03-01', moodScore: 4 }),
    ]);

    const { container } = renderWithQuery(<OneOnOneTab employeeId={EMPLOYEE_ID} />);

    await screen.findByText('2025-01-01');
    const badges = Array.from(container.querySelectorAll('[data-slot="badge"]'));
    expect(badges.map((b) => b.textContent)).toEqual(['2', '3', '4']);
    // 3 未満 / 3以上4未満 / 4以上 で異なるバリアントになる
    expect(badges.map((b) => b.getAttribute('data-variant'))).toEqual([
      'outline',
      'secondary',
      'default',
    ]);
  });
});
