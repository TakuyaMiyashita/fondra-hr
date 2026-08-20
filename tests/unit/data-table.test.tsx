import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from '@/components/shared/data-table';

interface Row {
  id: string;
  name: string;
}

const columns: LegacyColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: '氏名' },
  { accessorKey: 'id', header: 'ID' },
];

function renderTable(data: Row[], total = data.length, emptyMessage?: string) {
  return render(
    <DataTable
      columns={columns}
      data={data}
      total={total}
      pagination={{ pageIndex: 0, pageSize: 10 }}
      sorting={[]}
      onPaginationChange={vi.fn()}
      onSortingChange={vi.fn()}
      emptyMessage={emptyMessage}
    />,
  );
}

describe('DataTable', () => {
  it('ヘッダーと行を描画する', () => {
    renderTable([
      { id: '1', name: '山田 太郎' },
      { id: '2', name: '佐藤 花子' },
    ]);

    expect(screen.getByText('氏名')).toBeInTheDocument();
    expect(screen.getByText('山田 太郎')).toBeInTheDocument();
    expect(screen.getByText('佐藤 花子')).toBeInTheDocument();
    // ヘッダー行 + データ2行
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('データが0件のとき、既定の空メッセージを1行に収めて表示する', () => {
    renderTable([], 0);

    const cell = screen.getByText('データがありません');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute('colspan', String(columns.length));
  });

  it('空メッセージを差し替えられる', () => {
    renderTable([], 0, '該当する従業員はいません');

    expect(screen.getByText('該当する従業員はいません')).toBeInTheDocument();
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
  });

  it('データが0件でもヘッダーは残す（列構成が消えると絞り込みを解除できない）', () => {
    renderTable([], 0);

    expect(screen.getByText('氏名')).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
  });

  it('列の表示状態で非表示にした列は描画しない', () => {
    render(
      <DataTable
        columns={columns}
        data={[{ id: '1', name: '山田 太郎' }]}
        total={1}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        sorting={[]}
        columnVisibility={{ id: false }}
        onPaginationChange={vi.fn()}
        onSortingChange={vi.fn()}
        onColumnVisibilityChange={vi.fn()}
      />,
    );

    expect(screen.getByText('氏名')).toBeInTheDocument();
    expect(screen.queryByText('ID')).not.toBeInTheDocument();
  });
});
