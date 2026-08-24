'use server';

import { getAuthContext } from '@/lib/auth';
import { type Result, err, ok } from '@/lib/result';
import { auditLogListQuerySchema, type AuditLogListQuery } from '@/lib/validations/audit-log';
import { AuthorizationError, authorizationMessage } from '@/services/authorize';
import {
  getResourceTypes as getResourceTypesSvc,
  listAuditLogs as listSvc,
} from '@/services/audit-log';
import type { AuditLogListResult } from '@/types/audit-log';

export async function fetchAuditLogs(
  query: AuditLogListQuery,
): Promise<Result<AuditLogListResult>> {
  const parsed = auditLogListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  try {
    const ctx = await getAuthContext();
    const result = await listSvc(ctx, parsed.data);
    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationError) return err(authorizationMessage(e));
    throw e;
  }
}

export async function fetchResourceTypes(): Promise<string[]> {
  try {
    const ctx = await getAuthContext();
    return await getResourceTypesSvc(ctx);
  } catch {
    return [];
  }
}
