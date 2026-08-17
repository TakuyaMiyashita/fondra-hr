import type { Metadata } from 'next';

import { getAuthContext } from '@/lib/auth';
import { listAuditLogs, getResourceTypes } from '@/services/audit-log';

import { AuditLogListClient } from './audit-log-list-client';

export const metadata: Metadata = {
  title: '監査ログ',
};

export default async function AuditLogsPage() {
  const ctx = await getAuthContext();

  const [result, resourceTypes] = await Promise.all([
    listAuditLogs(ctx, { page: 1, perPage: 20, order: 'desc' }),
    getResourceTypes(ctx),
  ]);

  return (
    <AuditLogListClient
      initialLogs={result.logs}
      initialTotal={result.total}
      resourceTypes={resourceTypes}
    />
  );
}
