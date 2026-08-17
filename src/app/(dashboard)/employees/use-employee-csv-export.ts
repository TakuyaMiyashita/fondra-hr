import { useCallback, useState } from 'react';

import { fetchEmployees } from './actions';
import type { EmployeeStatus } from '@/types/employee';

interface CsvExportParams {
  search?: string;
  status?: EmployeeStatus;
  departmentId?: string;
}

const BOM = '﻿';

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const statusLabels: Record<string, string> = {
  active: '在籍',
  inactive: '休職',
  retired: '退職',
};

export function useEmployeeCsvExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(async (params: CsvExportParams) => {
    setIsExporting(true);
    try {
      const result = await fetchEmployees({
        page: 1,
        perPage: 100,
        sort: 'employeeCode',
        order: 'asc',
        search: params.search,
        status: params.status,
        departmentId: params.departmentId,
      });

      if (!result.success) return;

      const headers = [
        '社員番号',
        '氏名',
        'フリガナ',
        'メール',
        '部署',
        '役職',
        'ステータス',
        '入社日',
      ];
      const rows = result.data.employees.map((emp) => [
        escapeCsv(emp.employeeCode),
        escapeCsv(emp.fullName),
        escapeCsv(emp.fullNameKana),
        escapeCsv(emp.email),
        escapeCsv(emp.departmentName),
        escapeCsv(emp.position),
        escapeCsv(statusLabels[emp.status] ?? emp.status),
        escapeCsv(emp.hiredOn),
      ]);

      const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportCsv, isExporting };
}
