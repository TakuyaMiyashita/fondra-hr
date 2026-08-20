'use client';

import { Download, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { VisibilityState } from '@/components/shared/data-table';
import type { DepartmentOption, EmployeeStatus } from '@/types/employee';

interface EmployeeTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: EmployeeStatus | undefined;
  onStatusChange: (value: EmployeeStatus | undefined) => void;
  departmentId: string | undefined;
  onDepartmentChange: (value: string | undefined) => void;
  departments: DepartmentOption[];
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  onCsvExport: () => void;
  isExporting: boolean;
}

const columnLabels: Record<string, string> = {
  employeeCode: '社員番号',
  fullName: '氏名',
  email: 'メール',
  departmentName: '部署',
  position: '役職',
  status: 'ステータス',
  hiredOn: '入社日',
};

// Base UI の Select は items を渡さないと、選択中の値をラベルではなく
// 生の値（active / __all__ など）のまま表示する。
const STATUS_ITEMS: Record<string, string> = {
  __all__: '全て',
  active: '在籍',
  inactive: '休職',
  retired: '退職',
};

export function EmployeeTableToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  departmentId,
  onDepartmentChange,
  departments,
  columnVisibility,
  onColumnVisibilityChange,
  onCsvExport,
  isExporting,
}: EmployeeTableToolbarProps) {
  const [localSearch, setLocalSearch] = useState(search);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleLocalSearch = useCallback(
    (value: string) => {
      setLocalSearch(value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 300);
    },
    [onSearchChange],
  );

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="名前・社員番号で検索..."
            aria-label="名前・社員番号で検索"
            value={localSearch}
            onChange={(e) => handleLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          items={STATUS_ITEMS}
          value={status ?? '__all__'}
          onValueChange={(v) => onStatusChange(v === '__all__' ? undefined : (v as EmployeeStatus))}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select
            items={{
              __all__: '全部署',
              ...Object.fromEntries(departments.map((d) => [d.id, d.name])),
            }}
            value={departmentId ?? '__all__'}
            onValueChange={(v) => onDepartmentChange(v === '__all__' || v == null ? undefined : v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="部署" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部署</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onCsvExport} disabled={isExporting}>
          <Download className="mr-1.5 size-4" />
          CSV
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="mr-1.5 size-4" />
                表示列
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuLabel>表示/非表示</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(columnLabels).map(([key, label]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={columnVisibility[key] !== false}
                  onCheckedChange={(checked) =>
                    onColumnVisibilityChange({ ...columnVisibility, [key]: checked })
                  }
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
