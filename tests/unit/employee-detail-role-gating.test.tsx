import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AvatarUpload } from '@/app/(dashboard)/employees/[id]/avatar-upload';
import type { Role } from '@/services/auth-context';

/**
 * 従業員マスタの書き込みは admin 以上（docs/database/authorization-matrix.md）。
 *
 * 防御の本体は Service Layer と Storage ポリシーで、ここは UX の話。
 * ただ「押しても必ず失敗するボタン」を出しておくのは案内として不親切で、
 * 認可マトリクスも UI での出し分けを責務として挙げている。
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/(dashboard)/employees/actions', () => ({ uploadAvatarAction: vi.fn() }));

const ADMIN_ROLES: Role[] = ['owner', 'admin'];
const NON_ADMIN_ROLES: Role[] = ['member', 'viewer'];

describe('AvatarUpload — ロールによる出し分け', () => {
  it.each(ADMIN_ROLES)('%s には差し替えできるボタンとして描画する', () => {
    render(
      <AvatarUpload employeeId="emp-1" fullName="山田 太郎" avatarPath={null} canUpload={true} />,
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it.each(NON_ADMIN_ROLES)('%s にはボタンとして描画しない', () => {
    render(
      <AvatarUpload employeeId="emp-1" fullName="山田 太郎" avatarPath={null} canUpload={false} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('権限が無くてもアバター自体は表示する', () => {
    // 隠すのは操作であって情報ではない。一覧・詳細に出るものなので
    // 参照まで塞ぐと画面が壊れる。
    render(
      <AvatarUpload employeeId="emp-1" fullName="山田 太郎" avatarPath={null} canUpload={false} />,
    );

    // イニシャルは姓名それぞれの1文字目（getInitials）。
    expect(screen.getByText('山太')).toBeInTheDocument();
  });

  it('権限が無いときはファイル入力を置かない', () => {
    // input が残っていると、DOM を直接触れば選択ダイアログを開けてしまう。
    const { container } = render(
      <AvatarUpload employeeId="emp-1" fullName="山田 太郎" avatarPath={null} canUpload={false} />,
    );

    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('権限があるときはファイル入力を置く', () => {
    const { container } = render(
      <AvatarUpload employeeId="emp-1" fullName="山田 太郎" avatarPath={null} canUpload={true} />,
    );

    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });
});
