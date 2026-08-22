import type { Metadata } from 'next';

import { getAuthContext } from '@/lib/auth';
import { getDepartmentTree, listDepartments } from '@/services/department';

import { DepartmentPageClient } from './department-page-client';

export const metadata: Metadata = {
  title: '組織図',
};

export default async function DepartmentsPage() {
  const ctx = await getAuthContext();

  const [tree, departments] = await Promise.all([getDepartmentTree(ctx), listDepartments(ctx)]);

  return <DepartmentPageClient initialTree={tree} departments={departments} />;
}
