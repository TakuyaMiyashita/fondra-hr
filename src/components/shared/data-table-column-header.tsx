'use client';

import type { RowData } from '@tanstack/react-table';
import type { LegacyColumn } from '@tanstack/react-table/legacy';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData extends RowData, TValue> {
  column: LegacyColumn<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8', className)}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      <span>{title}</span>
      {sorted === 'asc' ? (
        <ArrowUp className="ml-1 size-3.5" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="ml-1 size-3.5" />
      ) : (
        <ArrowUpDown className="ml-1 size-3.5" />
      )}
    </Button>
  );
}
