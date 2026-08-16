import { getAuthContext } from '@/lib/auth';
import { listMembers, listPendingInvitations } from '@/services/settings';
import { hasMinRole } from '@/services/authorize';

import { MembersClient } from './members-client';

export default async function MembersPage() {
  const ctx = await getAuthContext();
  const members = await listMembers(ctx);
  const isAdmin = hasMinRole(ctx, 'admin');
  const invitations = isAdmin ? await listPendingInvitations(ctx) : [];

  return (
    <MembersClient
      members={members}
      invitations={invitations}
      role={ctx.role}
      currentUserId={ctx.userId}
    />
  );
}
