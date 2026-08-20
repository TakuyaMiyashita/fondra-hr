import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/app/(auth)/login/login-form';

const signIn = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => new URLSearchParams());

vi.mock('@/app/(auth)/actions', () => ({ signIn }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

describe('LoginForm', () => {
  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue({ success: true, data: undefined });
    toastError.mockReset();
    searchParams.delete('registered');
  });

  // input[type=email] のブラウザ標準バリデーションを通り抜ける値を使う。
  // "not-an-email" だと標準バリデーションが submit 自体を止めてしまい、
  // Zod のメッセージが描画されるかを確かめられない。
  it('メールアドレスが不正な形式のとき、Zod のメッセージを表示する', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('メールアドレス'), 'user@localhost');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('有効なメールアドレスを入力してください')).toBeInTheDocument();
  });

  it('パスワードが空のとき、Zod のメッセージを表示する', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('メールアドレス'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('パスワードを入力してください')).toBeInTheDocument();
  });

  it('バリデーションに失敗した入力を Server Action へ送らない', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await screen.findByText('有効なメールアドレスを入力してください');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('入力が正しいとき、Server Action に検証済みの値を渡す', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('メールアドレス'), 'user@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      }),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('Server Action がエラーを返したとき、その内容を toast で通知する', async () => {
    signIn.mockResolvedValue({ success: false, error: 'メールまたはパスワードが違います' });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('メールアドレス'), 'user@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('メールまたはパスワードが違います'),
    );
    // フィールドのエラー表示は Zod 由来のものだけで、サーバーエラーは toast に出す
    expect(screen.queryByText('メールまたはパスワードが違います')).not.toBeInTheDocument();
  });

  it('registered パラメータが無いとき、確認メールの案内を出さない', () => {
    render(<LoginForm />);

    expect(screen.queryByText(/アカウントを作成しました/)).not.toBeInTheDocument();
  });

  it('registered=true で遷移してきたとき、確認メールの案内を表示する', () => {
    searchParams.set('registered', 'true');

    render(<LoginForm />);

    expect(
      screen.getByText('アカウントを作成しました。メールを確認してからログインしてください。'),
    ).toBeInTheDocument();
  });
});
