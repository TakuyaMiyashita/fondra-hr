import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { employeeColumns } from '@/app/(dashboard)/employees/employee-columns';
import { DataTable } from '@/components/shared/data-table';
import type { Employee } from '@/types/employee';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    employeeCode: 'E-001',
    fullName: '山田 太郎',
    fullNameKana: 'ヤマダ タロウ',
    email: 'yamada@example.com',
    position: 'エンジニア',
    departmentId: '22222222-2222-2222-2222-222222222222',
    departmentName: '開発部',
    hiredOn: '2020-04-01',
    status: 'active',
    avatarPath: null,
    createdAt: new Date('2020-04-01T00:00:00Z'),
    ...overrides,
  };
}

// 列定義は cell レンダラの集合なので、テーブルに載せて初めて描画結果を確かめられる。
function renderColumns(employees: Employee[]) {
  return render(
    <DataTable
      columns={employeeColumns}
      data={employees}
      total={employees.length}
      pagination={{ pageIndex: 0, pageSize: 10 }}
      sorting={[]}
      onPaginationChange={vi.fn()}
      onSortingChange={vi.fn()}
    />,
  );
}

/** データ行（ヘッダー行を除く先頭行） */
function dataRow(): HTMLElement {
  return screen.getAllByRole('row')[1] as HTMLElement;
}

describe('employeeColumns', () => {
  it('全項目が埋まっているとき、各列の値を表示する', () => {
    renderColumns([makeEmployee()]);

    const row = within(dataRow());
    expect(row.getByText('E-001')).toBeInTheDocument();
    expect(row.getByText('ヤマダ タロウ')).toBeInTheDocument();
    expect(row.getByText('yamada@example.com')).toBeInTheDocument();
    expect(row.getByText('開発部')).toBeInTheDocument();
    expect(row.getByText('エンジニア')).toBeInTheDocument();
    expect(row.getByText('2020-04-01')).toBeInTheDocument();
  });

  it('氏名から詳細ページへのリンクを張り、頭文字をアバター代わりに表示する', () => {
    renderColumns([makeEmployee({ fullName: '鈴木 一郎' })]);

    const row = within(dataRow());
    expect(row.getByRole('link', { name: '鈴木 一郎' })).toHaveAttribute(
      'href',
      '/employees/11111111-1111-1111-1111-111111111111',
    );
    expect(row.getByText('鈴')).toBeInTheDocument();
  });

  it('フリガナが null のとき、フリガナ行を描画しない', () => {
    renderColumns([makeEmployee({ fullNameKana: null })]);

    expect(screen.queryByText('ヤマダ タロウ')).not.toBeInTheDocument();
    expect(within(dataRow()).getByRole('link', { name: '山田 太郎' })).toBeInTheDocument();
  });

  it('マスクされた null 項目を「—」で表示する', () => {
    renderColumns([
      makeEmployee({ email: null, departmentName: null, position: null, hiredOn: null }),
    ]);

    // メール・部署・役職・入社日の4列
    expect(within(dataRow()).getAllByText('—')).toHaveLength(4);
  });

  it('3つのステータスをそれぞれ日本語バッジで表示する', () => {
    renderColumns([
      makeEmployee({ id: 'a', status: 'active' }),
      makeEmployee({ id: 'b', status: 'inactive' }),
      makeEmployee({ id: 'c', status: 'retired' }),
    ]);

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('在籍')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('休職')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('退職')).toBeInTheDocument();
  });

  it('操作列に詳細ページへのリンクを置く', () => {
    renderColumns([makeEmployee()]);

    const links = within(dataRow()).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[1]).toHaveAttribute('href', '/employees/11111111-1111-1111-1111-111111111111');
  });
});
