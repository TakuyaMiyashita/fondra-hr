'use client';

import type {
  ColumnVisibilityState,
  OnChangeFn,
  PaginationState,
  RowData,
  SortingState,
} from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import {
  type LegacyColumnDef,
  getCoreRowModel,
  useLegacyTable,
} from '@tanstack/react-table/legacy';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type VisibilityState = ColumnVisibilityState;

interface DataTableProps<TData extends RowData> {
  columns: LegacyColumnDef<TData, unknown>[];
  data: TData[];
  total: number;
  pagination: PaginationState;
  sorting: SortingState;
  columnVisibility?: VisibilityState;
  onPaginationChange: OnChangeFn<PaginationState>;
  onSortingChange: OnChangeFn<SortingState>;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  emptyMessage?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  total,
  pagination,
  sorting,
  columnVisibility,
  onPaginationChange,
  onSortingChange,
  onColumnVisibilityChange,
  emptyMessage = 'データがありません',
}: DataTableProps<TData>) {
  const table = useLegacyTable({
    data,
    columns,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: {
      pagination,
      sorting,
      columnVisibility,
    },
    onPaginationChange,
    onSortingChange,
    onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
