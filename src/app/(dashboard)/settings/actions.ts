'use server';

import { revalidatePath } from 'next/cache';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { uuidField } from '@/lib/validations/common';
import { changeRoleSchema, inviteMemberSchema, updateOrgSchema } from '@/lib/validations/settings';
import { AuthorizationError, authorizationMessage } from '@/services/authorize';
import {
  changeRole as changeRoleSvc,
  createInvitation as createInviteSvc,
  getOrgInfo as getOrgInfoSvc,
  listMembers as listMembersSvc,
  listPendingInvitations as listInvitesSvc,
  removeMember as removeMemberSvc,
  revokeInvitation as revokeInviteSvc,
  updateOrg as updateOrgSvc,
} from '@/services/settings';
import type { OrgInfo, OrgMember, PendingInvitation } from '@/types/settings';

export async function fetchOrgInfo(): Promise<Result<OrgInfo>> {
  try {
    const ctx = await getAuthContext();
    return await getOrgInfoSvc(ctx);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function updateOrgAction(data: unknown): Promise<Result<void>> {
  const parsed = updateOrgSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await updateOrgSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/settings');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function fetchMembers(): Promise<Result<OrgMember[]>> {
  try {
    const ctx = await getAuthContext();
    const members = await listMembersSvc(ctx);
    return ok(members);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function changeRoleAction(data: unknown): Promise<Result<void>> {
  const parsed = changeRoleSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await changeRoleSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/settings/members');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

const membershipIdSchema = uuidField('メンバー');
const invitationIdSchema = uuidField('招待');

export async function removeMemberAction(membershipId: string): Promise<Result<void>> {
  const parsed = membershipIdSchema.safeParse(membershipId);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await removeMemberSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/settings/members');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function inviteMemberAction(data: unknown): Promise<Result<{ token: string }>> {
  const parsed = inviteMemberSchema.safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await createInviteSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/settings/members');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function fetchPendingInvitations(): Promise<Result<PendingInvitation[]>> {
  try {
    const ctx = await getAuthContext();
    const invites = await listInvitesSvc(ctx);
    return ok(invites);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<Result<void>> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await revokeInviteSvc(ctx, parsed.data);
    if (result.success) {
      revalidatePath('/settings/members');
    }
    return result;
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}
