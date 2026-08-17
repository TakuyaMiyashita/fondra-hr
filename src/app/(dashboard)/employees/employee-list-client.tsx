'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';

import { DataTable, type VisibilityState } from '@/components/shared/data-table';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { Button } from '@/components/ui/button';
import type { DepartmentOption, EmployeeListResult, EmployeeStatus } from '@/types/employee';

import { fetchEmployees } from './actions';
import { employeeColumns } from './employee-columns';
import { EmployeeFormSheet } from './employee-form-sheet';
import { EmployeeTableToolbar } from './employee-table-toolbar';
import { useEmployeeCsvExport } from './use-employee-csv-export';

interface EmployeeListClientProps {
  initialData: EmployeeListResult;
  departments: DepartmentOption[];
}

type SortKey =
  'employeeCode' | 'fullName' | 'email' | 'position' | 'hiredOn' | 'status' | 'createdAt';

export function EmployeeListClient({ initialData, departments }: EmployeeListClientProps) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [perPage, setPerPage] = useQueryState('perPage', parseAsInteger.withDefault(20));
  const [sort, setSort] = useQueryState('sort', parseAsString.withDefault('createdAt'));
  const [order, setOrder] = useQueryState(
    'order',
    parseAsStringEnum(['asc', 'desc'] as const).withDefault('desc'),
  );
  const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
  const [status, setStatus] = useQueryState(
    'status',
    parseAsStringEnum(['active', 'inactive', 'retired'] as const),
  );
  const [departmentId, setDepartmentId] = useQueryState('departmentId', parseAsString);

  const [columnVisibility, setColumnVisibility] = useQueryState('cols', {
    parse: (v: string) => {
      try {
        return JSON.parse(v) as VisibilityState;
      } catch {
        return {};
      }
    },
    serialize: (v: VisibilityState) => JSON.stringify(v),
    defaultValue: {} as VisibilityState,
    eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  const queryKey = useMemo(
    () =>
      [
        'employees',
        {
          page,
          perPage,
          sort,
          order,
          search: search || undefined,
          status: status ?? undefined,
          departmentId: departmentId ?? undefined,
        },
      ] as const,
    [page, perPage, sort, order, search, status, departmentId],
  );

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await fetchEmployees({
        page,
        perPage,
        sort: sort as SortKey,
        order,
        search: search || undefined,
        status: status ?? undefined,
        departmentId: departmentId ?? undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData,
    staleTime: 30_000,
  });

  const pagination: PaginationState = useMemo(
    () => ({ pageIndex: page - 1, pageSize: perPage }),
    [page, perPage],
  );

  const sorting: SortingState = useMemo(
    () => [{ id: sort, desc: order === 'desc' }],
    [sort, order],
  );

  const handlePaginationChange = useCallback(
    (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      void setPage(next.pageIndex + 1);
      void setPerPage(next.pageSize);
    },
    [pagination, setPage, setPerPage],
  );

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (next.length > 0) {
        void setSort(next[0].id);
        void setOrder(next[0].desc ? 'desc' : 'asc');
        void setPage(1);
      }
    },
    [sorting, setSort, setOrder, setPage],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      void setSearch(value || null);
      void setPage(1);
    },
    [setSearch, setPage],
  );

  const handleStatusChange = useCallback(
    (value: EmployeeStatus | undefined) => {
      void setStatus(value ?? null);
      void setPage(1);
    },
    [setStatus, setPage],
  );

  const handleDepartmentChange = useCallback(
    (value: string | undefined) => {
      void setDepartmentId(value ?? null);
      void setPage(1);
    },
    [setDepartmentId, setPage],
  );

  const { exportCsv, isExporting } = useEmployeeCsvExport();

  const handleCsvExport = useCallback(() => {
    void exportCsv({
      search: search || undefined,
      status: status ?? undefined,
      departmentId: departmentId ?? undefined,
    });
  }, [exportCsv, search, status, departmentId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <EmployeeTableToolbar
          search={search}
          onSearchChange={handleSearchChange}
          status={status ?? undefined}
          onStatusChange={handleStatusChange}
          departmentId={departmentId ?? undefined}
          onDepartmentChange={handleDepartmentChange}
          departments={departments}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={(v) => void setColumnVisibility(v)}
          onCsvExport={handleCsvExport}
          isExporting={isExporting}
        />
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          新規登録
        </Button>
      </div>
      <DataTable
        columns={employeeColumns}
        data={data.employees}
        total={data.total}
        pagination={pagination}
        sorting={sorting}
        columnVisibility={columnVisibility}
        onPaginationChange={handlePaginationChange}
        onSortingChange={handleSortingChange}
        onColumnVisibilityChange={(updater) => {
          const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
          void setColumnVisibility(next);
        }}
        emptyMessage="従業員が登録されていません"
      />
      <DataTablePagination
        page={page}
        perPage={perPage}
        total={data.total}
        onPageChange={(p) => void setPage(p)}
        onPerPageChange={(pp) => {
          void setPerPage(pp);
          void setPage(1);
        }}
      />
      <EmployeeFormSheet
        mode="create"
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        departments={departments}
        onSuccess={() => {
          setSheetOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['employees'] });
        }}
      />
    </div>
  );
}
