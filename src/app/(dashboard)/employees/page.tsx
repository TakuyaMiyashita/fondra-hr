import type { Metadata } from 'next';
import { Users } from 'lucide-react';

import { getAuthContext } from '@/lib/auth';
import { employeeListQuerySchema } from '@/lib/validations/employee';
import { getDepartmentsForOrg, listEmployees } from '@/services/employee';

import { EmployeeListClient } from './employee-list-client';

export const metadata: Metadata = {
  title: '従業員一覧',
};

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  const rawParams = await searchParams;

  const parsed = employeeListQuerySchema.safeParse(rawParams);
  const query = parsed.success
    ? parsed.data
    : { page: 1, perPage: 20, sort: 'createdAt' as const, order: 'desc' as const };

  const [result, departments] = await Promise.all([
    listEmployees(ctx, query),
    getDepartmentsForOrg(ctx),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">従業員管理</h1>
          <p className="text-sm text-muted-foreground">従業員の一覧表示・検索・管理</p>
        </div>
      </div>
      {result.total === 0 && !parsed.success ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="size-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">従業員が登録されていません</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            「新規登録」ボタンから従業員を追加してください
          </p>
        </div>
      ) : (
        <EmployeeListClient initialData={result} departments={departments} />
      )}
    </div>
  );
}
