import type { Metadata } from 'next';

import { getAuthContext } from '@/lib/auth';
import { listCycles } from '@/services/evaluation';
import { getEmployeesForOrg } from '@/services/one-on-one';

import { EvaluationPageClient } from './evaluation-page-client';

export const metadata: Metadata = {
  title: '評価',
};

export default async function EvaluationsPage() {
  const ctx = await getAuthContext();

  const [cycles, employees] = await Promise.all([listCycles(ctx), getEmployeesForOrg(ctx)]);

  return <EvaluationPageClient initialCycles={cycles} employees={employees} role={ctx.role} />;
}
