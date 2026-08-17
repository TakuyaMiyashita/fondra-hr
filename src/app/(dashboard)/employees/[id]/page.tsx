import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getAuthContext } from '@/lib/auth';
import { getEmployee } from '@/services/employee';
import { getDepartmentsForOrg } from '@/services/employee';

import { EmployeeDetailClient } from './employee-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '従業員詳細',
};

export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const result = await getEmployee(ctx, id);

  if (!result.success) {
    notFound();
  }

  const departments = await getDepartmentsForOrg(ctx);

  return <EmployeeDetailClient employee={result.data} departments={departments} />;
}
