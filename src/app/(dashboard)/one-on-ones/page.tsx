import { getAuthContext } from '@/lib/auth';
import { getEmployeesForOrg, listOneOnOnes } from '@/services/one-on-one';

import { OneOnOneListClient } from './one-on-one-list-client';

export default async function OneOnOnesPage() {
  const ctx = await getAuthContext();

  const [result, employees] = await Promise.all([
    listOneOnOnes(ctx, { page: 1, perPage: 20, sort: 'heldOn', order: 'desc' }),
    getEmployeesForOrg(ctx),
  ]);

  return (
    <OneOnOneListClient
      initialRecords={result.records}
      initialTotal={result.total}
      employees={employees}
    />
  );
}
