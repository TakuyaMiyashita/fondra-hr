import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AuditLogsError from '@/app/(dashboard)/audit-logs/error';
import DashboardError from '@/app/(dashboard)/dashboard/error';
import DepartmentsError from '@/app/(dashboard)/departments/error';
import EmployeeDetailError from '@/app/(dashboard)/employees/[id]/error';
import EmployeesError from '@/app/(dashboard)/employees/error';
import EvaluationsError from '@/app/(dashboard)/evaluations/error';
import OneOnOnesError from '@/app/(dashboard)/one-on-ones/error';
import MembersError from '@/app/(dashboard)/settings/members/error';
import SettingsError from '@/app/(dashboard)/settings/error';
import SkillsError from '@/app/(dashboard)/skills/error';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

type ErrorComponent = (props: {
  error: Error & { digest?: string };
  reset: () => void;
}) => React.ReactNode;

// CLAUDE.md は「データ取得を行う画面に error.tsx を必ず置く」ことを求めている。
// 画面ごとに文言は違っても、再試行できるという契約は共通のはず。
const boundaries: [name: string, Component: ErrorComponent, heading: string][] = [
  ['監査ログ', AuditLogsError, '監査ログの取得に失敗しました'],
  ['ダッシュボード', DashboardError, 'ダッシュボードの読み込みに失敗しました'],
  ['部署', DepartmentsError, '部署データの読み込みに失敗しました'],
  ['従業員一覧', EmployeesError, '従業員データの読み込みに失敗しました'],
  ['従業員詳細', EmployeeDetailError, '従業員情報の取得に失敗しました'],
  ['評価', EvaluationsError, '評価データの取得に失敗しました'],
  ['1on1', OneOnOnesError, '1on1データの取得に失敗しました'],
  ['設定', SettingsError, '設定の読み込みに失敗しました'],
  ['メンバー', MembersError, 'メンバー情報の読み込みに失敗しました'],
  ['スキル', SkillsError, 'スキルデータの取得に失敗しました'],
];

describe('エラー境界', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it.each(boundaries)(
    '%s: 失敗の見出しを出し、再試行から reset を呼べる',
    async (_name, Component, heading) => {
      const user = userEvent.setup();
      const reset = vi.fn();
      render(<Component error={new Error('boom')} reset={reset} />);

      expect(screen.getByText(heading)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '再試行' }));
      expect(reset).toHaveBeenCalledTimes(1);
    },
  );

  describe('原因の提示', () => {
    it('エラーメッセージがあるとき、そのまま表示する', () => {
      render(<EmployeesError error={new Error('接続がタイムアウトしました')} reset={vi.fn()} />);

      expect(screen.getByText('接続がタイムアウトしました')).toBeInTheDocument();
    });

    it('エラーメッセージが空のとき、汎用の案内にフォールバックする', () => {
      render(<EmployeesError error={new Error('')} reset={vi.fn()} />);

      expect(
        screen.getByText(
          'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('従業員詳細からの退避', () => {
    it('一覧に戻るボタンで従業員一覧へ遷移する', async () => {
      const user = userEvent.setup();
      render(<EmployeeDetailError error={new Error('boom')} reset={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: '一覧に戻る' }));

      expect(push).toHaveBeenCalledWith('/employees');
    });
  });
});
