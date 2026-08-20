'use client';

import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { Eye } from 'lucide-react';
import Link from 'next/link';

import { ButtonLink } from '@/components/shared/button-link';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import type { Employee, EmployeeStatus } from '@/types/employee';

const statusConfig: Record<
  EmployeeStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  active: { label: '在籍', variant: 'default' },
  inactive: { label: '休職', variant: 'secondary' },
  retired: { label: '退職', variant: 'outline' },
};

export const employeeColumns: LegacyColumnDef<Employee, unknown>[] = [
  {
    accessorKey: 'employeeCode',
    header: ({ column }) => <DataTableColumnHeader column={column} title="社員番号" />,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.getValue('employeeCode') as string}</span>
    ),
  },
  {
    accessorKey: 'fullName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="氏名" />,
    cell: ({ row }) => {
      const employee = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {employee.fullName.charAt(0)}
          </div>
          <div className="min-w-0">
            <Link href={`/employees/${employee.id}`} className="font-medium hover:underline">
              {employee.fullName}
            </Link>
            {employee.fullNameKana && (
              <p className="text-muted-foreground truncate text-xs">{employee.fullNameKana}</p>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title="メール" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{(row.getValue('email') as string) ?? '—'}</span>
    ),
  },
  {
    id: 'departmentName',
    accessorKey: 'departmentName',
    header: '部署',
    cell: ({ row }) => row.original.departmentName ?? '—',
  },
  {
    accessorKey: 'position',
    header: ({ column }) => <DataTableColumnHeader column={column} title="役職" />,
    cell: ({ row }) => <span>{(row.getValue('position') as string) ?? '—'}</span>,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="ステータス" />,
    cell: ({ row }) => {
      const status = row.getValue('status') as EmployeeStatus;
      const config = statusConfig[status];
      return <Badge variant={config.variant}>{config.label}</Badge>;
    },
  },
  {
    accessorKey: 'hiredOn',
    header: ({ column }) => <DataTableColumnHeader column={column} title="入社日" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{(row.getValue('hiredOn') as string) ?? '—'}</span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <ButtonLink
        variant="ghost"
        size="icon"
        className="size-8"
        href={`/employees/${row.original.id}`}
        aria-label={`${row.original.fullName} の詳細を表示`}
      >
        <Eye className="size-4" />
      </ButtonLink>
    ),
  },
];
