import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthError from '@/app/(auth)/error';
import InviteAcceptError from '@/app/(auth)/invite/[token]/error';
import AuditLogsError from '@/app/(dashboard)/audit-logs/error';
import DashboardError from '@/app/(dashboard)/dashboard/error';
import DepartmentsError from '@/app/(dashboard)/departments/error';
import EmployeeDetailError from '@/app/(dashboard)/employees/[id]/error';
import EmployeesError from '@/app/(dashboard)/employees/error';
import EvaluationsError from '@/app/(dashboard)/evaluations/error';
import GlobalError from '@/app/global-error';
import NotFound from '@/app/not-found';
import OneOnOnesError from '@/app/(dashboard)/one-on-ones/error';
import MembersError from '@/app/(dashboard)/settings/members/error';
import SettingsError from '@/app/(dashboard)/settings/error';
import SkillsError from '@/app/(dashboard)/skills/error';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

// Next.js 16.3 で error boundary の復帰用 prop は `reset` から `retry` になった。
// `reset` は再フェッチせず子を再レンダリングするだけなので、データ取得の失敗は
// 何度押しても直らない。`retry` は再フェッチを伴うため「再試行」の意味に合う。
type ErrorComponent = (props: {
  error: Error & { digest?: string };
  retry: () => void;
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
  ['認証グループ', AuthError, '問題が発生しました'],
  ['招待承認', InviteAcceptError, '招待の読み込みに失敗しました'],
];

describe('エラー境界', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it.each(boundaries)(
    '%s: 失敗の見出しを出し、再試行から retry を呼べる',
    async (_name, Component, heading) => {
      const user = userEvent.setup();
      const retry = vi.fn();
      render(<Component error={new Error('boom')} retry={retry} />);

      expect(screen.getByText(heading)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '再試行' }));
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );

  describe('原因の提示', () => {
    it('エラーメッセージがあるとき、そのまま表示する', () => {
      render(<EmployeesError error={new Error('接続がタイムアウトしました')} retry={vi.fn()} />);

      expect(screen.getByText('接続がタイムアウトしました')).toBeInTheDocument();
    });

    it('エラーメッセージが空のとき、汎用の案内にフォールバックする', () => {
      render(<EmployeesError error={new Error('')} retry={vi.fn()} />);

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
      render(<EmployeeDetailError error={new Error('boom')} retry={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: '一覧に戻る' }));

      expect(push).toHaveBeenCalledWith('/employees');
    });
  });

  describe('認証画面からの退避', () => {
    it('招待の読み込みに失敗しても、ログイン画面への導線が残る', () => {
      render(<InviteAcceptError error={new Error('boom')} retry={vi.fn()} />);

      expect(screen.getByRole('link', { name: 'ログイン画面へ' })).toHaveAttribute(
        'href',
        '/login',
      );
    });

    it('招待のエラーメッセージが空のとき、汎用の案内にフォールバックする', () => {
      render(<InviteAcceptError error={new Error('')} retry={vi.fn()} />);

      expect(
        screen.getByText(
          'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。',
        ),
      ).toBeInTheDocument();
    });

    it('認証グループのエラーメッセージが空のとき、汎用の案内にフォールバックする', () => {
      render(<AuthError error={new Error('')} retry={vi.fn()} />);

      expect(
        screen.getByText(
          'サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しください。',
        ),
      ).toBeInTheDocument();
    });
  });
});

describe('404 ページ', () => {
  it('見出しを出し、トップへの導線を持つ', () => {
    render(<NotFound />);

    expect(screen.getByText('ページが見つかりません')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'トップに戻る' })).toHaveAttribute('href', '/');
  });
});

describe('global-error', () => {
  // global-error はルートレイアウトを差し替えるため <html> / <body> を自前で持つ。
  // それを div の下に描画すると React が DOM ネストの警告を出すが、実行時の
  // 配置とは無関係なのでこのテストの間だけ黙らせる。
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('見出しを出し、再試行から retry を呼べる', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<GlobalError error={new Error('boom')} retry={retry} />);

    expect(screen.getByText('問題が発生しました')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('digest があるとき、問い合わせ用にエラーIDを添える', () => {
    render(
      <GlobalError
        error={Object.assign(new Error('boom'), { digest: 'abc123' })}
        retry={vi.fn()}
      />,
    );

    expect(screen.getByText(/エラーID: abc123/)).toBeInTheDocument();
  });

  it('digest が無いとき、エラーIDを出さない', () => {
    render(<GlobalError error={new Error('boom')} retry={vi.fn()} />);

    expect(screen.queryByText(/エラーID/)).not.toBeInTheDocument();
  });
});
