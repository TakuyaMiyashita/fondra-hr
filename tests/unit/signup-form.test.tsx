import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignupForm } from '@/app/(auth)/signup/signup-form';

const signUp = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/app/(auth)/actions', () => ({ signUp }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

const HELP_TEXT = '8文字以上で入力してください';

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { orgName?: string; email?: string; password?: string },
) {
  if (values.orgName) await user.type(screen.getByLabelText('組織名'), values.orgName);
  if (values.email) await user.type(screen.getByLabelText('メールアドレス'), values.email);
  if (values.password) await user.type(screen.getByLabelText('パスワード'), values.password);
  await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));
}

describe('SignupForm', () => {
  beforeEach(() => {
    signUp.mockReset();
    signUp.mockResolvedValue({ success: true, data: undefined });
    toastError.mockReset();
  });

  it('初期表示ではエラーを出さず、パスワードの補足説明を表示する', () => {
    render(<SignupForm />);

    expect(screen.getByText(HELP_TEXT)).toBeInTheDocument();
  });

  it('組織名が未入力のとき、Zod のメッセージを表示する', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillForm(user, { email: 'user@example.com', password: 'password123' });

    expect(await screen.findByText('組織名を入力してください')).toBeInTheDocument();
  });

  it('メールアドレスが不正な形式のとき、Zod のメッセージを表示する', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    // 標準バリデーションを通り抜けるが Zod では弾かれる値
    await fillForm(user, {
      orgName: '株式会社テスト',
      email: 'user@localhost',
      password: 'password123',
    });

    expect(await screen.findByText('有効なメールアドレスを入力してください')).toBeInTheDocument();
  });

  it('パスワードが7文字（境界の下）のとき、エラーが補足説明を置き換える', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillForm(user, {
      orgName: '株式会社テスト',
      email: 'user@example.com',
      password: '1234567',
    });

    expect(await screen.findByText('パスワードは8文字以上で入力してください')).toBeInTheDocument();
    // エラーと補足説明は排他。両方出ると何が問題か読み取れなくなる
    expect(screen.queryByText(HELP_TEXT)).not.toBeInTheDocument();
  });

  it('パスワードが8文字（境界）のとき、エラーを出さず Server Action に渡す', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillForm(user, {
      orgName: '株式会社テスト',
      email: 'user@example.com',
      password: '12345678',
    });

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        orgName: '株式会社テスト',
        email: 'user@example.com',
        password: '12345678',
      }),
    );
    expect(screen.getByText(HELP_TEXT)).toBeInTheDocument();
  });

  it('バリデーションに失敗した入力を Server Action へ送らない', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillForm(user, {});

    await screen.findByText('組織名を入力してください');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('Server Action がエラーを返したとき、その内容を toast で通知する', async () => {
    signUp.mockResolvedValue({ success: false, error: 'このメールアドレスは既に登録済みです' });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillForm(user, {
      orgName: '株式会社テスト',
      email: 'user@example.com',
      password: 'password123',
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('このメールアドレスは既に登録済みです'),
    );
  });
});
