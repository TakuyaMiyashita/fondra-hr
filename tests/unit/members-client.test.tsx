import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MembersClient } from '@/app/(dashboard)/settings/members/members-client';
import type { Role } from '@/services/auth-context';
import type { OrgMember, PendingInvitation } from '@/types/settings';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/(dashboard)/settings/actions', () => ({
  changeRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
}));
vi.mock('@/app/(dashboard)/settings/members/invite-dialog', () => ({
  InviteDialog: () => null,
}));

const CURRENT_USER_ID = 'user-self';

function makeMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: 'm-1',
    userId: 'user-1',
    email: 'member@example.com',
    role: 'member',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeInvitation(overrides: Partial<PendingInvitation> = {}): PendingInvitation {
  return {
    id: 'i-1',
    email: 'invited@example.com',
    role: 'viewer',
    expiresAt: new Date('2025-12-31T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function renderMembers(role: Role, members: OrgMember[], invitations: PendingInvitation[] = []) {
  return render(
    <MembersClient
      members={members}
      invitations={invitations}
      role={role}
      currentUserId={CURRENT_USER_ID}
    />,
  );
}

/** メールアドレスから該当メンバーの行を引く */
function rowOf(email: string): HTMLElement {
  return screen.getByText(email).closest('tr') as HTMLElement;
}

describe('MembersClient', () => {
  describe('管理権限の有無による操作の出し分け', () => {
    // 招待できる最下位ロール（admin）と、その1つ下（member）の両方を必ず通す
    it.each(['owner', 'admin'] as const)('%s には招待ボタンを表示する', (role) => {
      renderMembers(role, [makeMember()]);

      expect(screen.getByRole('button', { name: '招待' })).toBeInTheDocument();
    });

    it.each(['member', 'viewer'] as const)('%s には招待ボタンを表示しない', (role) => {
      renderMembers(role, [makeMember()]);

      expect(screen.queryByRole('button', { name: '招待' })).not.toBeInTheDocument();
    });

    it('管理者には他メンバーのロールを変更するセレクトを表示する', () => {
      renderMembers('admin', [makeMember()]);

      expect(within(rowOf('member@example.com')).getByRole('combobox')).toBeInTheDocument();
    });

    it('メンバーにはロールをバッジ表示のみとし、変更手段を与えない', () => {
      renderMembers('member', [makeMember()]);

      const row = within(rowOf('member@example.com'));
      expect(row.queryByRole('combobox')).not.toBeInTheDocument();
      expect(row.getByText('メンバー')).toBeInTheDocument();
    });

    it('メンバーには削除ボタンを表示しない', () => {
      renderMembers('member', [makeMember()]);

      expect(within(rowOf('member@example.com')).queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('オーナー行と自分自身の行の保護', () => {
    it('管理者から見てもオーナー行はロール変更できない', () => {
      renderMembers('admin', [makeMember({ email: 'owner@example.com', role: 'owner' })]);

      const row = within(rowOf('owner@example.com'));
      expect(row.queryByRole('combobox')).not.toBeInTheDocument();
      expect(row.getByText('オーナー')).toBeInTheDocument();
      expect(row.queryByRole('button')).not.toBeInTheDocument();
    });

    it('自分自身の行はロール変更も削除もできず、「自分」バッジが付く', () => {
      renderMembers('owner', [
        makeMember({ id: 'm-self', userId: CURRENT_USER_ID, email: 'self@example.com' }),
      ]);

      const row = within(rowOf('self@example.com'));
      expect(row.getByText('自分')).toBeInTheDocument();
      expect(row.queryByRole('combobox')).not.toBeInTheDocument();
      expect(row.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('保留中の招待', () => {
    it('管理者には保留中の招待一覧を表示する', () => {
      renderMembers('admin', [makeMember()], [makeInvitation()]);

      expect(screen.getByText('保留中の招待')).toBeInTheDocument();
      expect(screen.getByText('invited@example.com')).toBeInTheDocument();
      expect(screen.getByText('閲覧者')).toBeInTheDocument();
    });

    it('招待が0件のときは一覧そのものを出さない', () => {
      renderMembers('admin', [makeMember()], []);

      expect(screen.queryByText('保留中の招待')).not.toBeInTheDocument();
    });

    it('メンバーには招待が存在しても一覧を見せない', () => {
      renderMembers('member', [makeMember()], [makeInvitation()]);

      expect(screen.queryByText('保留中の招待')).not.toBeInTheDocument();
      expect(screen.queryByText('invited@example.com')).not.toBeInTheDocument();
    });
  });

  describe('ロールの表示', () => {
    it('4つのロールをそれぞれ日本語ラベルで表示する', () => {
      renderMembers('viewer', [
        makeMember({ id: 'a', userId: 'u-a', email: 'a@example.com', role: 'owner' }),
        makeMember({ id: 'b', userId: 'u-b', email: 'b@example.com', role: 'admin' }),
        makeMember({ id: 'c', userId: 'u-c', email: 'c@example.com', role: 'member' }),
        makeMember({ id: 'd', userId: 'u-d', email: 'd@example.com', role: 'viewer' }),
      ]);

      expect(within(rowOf('a@example.com')).getByText('オーナー')).toBeInTheDocument();
      expect(within(rowOf('b@example.com')).getByText('管理者')).toBeInTheDocument();
      expect(within(rowOf('c@example.com')).getByText('メンバー')).toBeInTheDocument();
      expect(within(rowOf('d@example.com')).getByText('閲覧者')).toBeInTheDocument();
    });

    it('メールアドレスが取得できないメンバーは「(不明)」と表示する', () => {
      renderMembers('owner', [makeMember({ email: null })]);

      expect(screen.getByText('(不明)')).toBeInTheDocument();
    });
  });
});
