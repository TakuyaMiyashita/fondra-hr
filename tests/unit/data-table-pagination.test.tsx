import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataTablePagination } from '@/components/shared/data-table-pagination';

function renderPagination(props: { page: number; perPage: number; total: number }) {
  const onPageChange = vi.fn();
  const onPerPageChange = vi.fn();
  render(
    <DataTablePagination
      {...props}
      onPageChange={onPageChange}
      onPerPageChange={onPerPageChange}
    />,
  );
  const [first, prev, next, last] = screen.getAllByRole('button');
  return { onPageChange, onPerPageChange, first: first!, prev: prev!, next: next!, last: last! };
}

describe('DataTablePagination', () => {
  describe('件数レンジの表示', () => {
    it('先頭ページのレンジを表示する', () => {
      renderPagination({ page: 1, perPage: 10, total: 25 });

      expect(screen.getByText(/全 25 件中 1–10 件/)).toBeInTheDocument();
    });

    it('端数の出る最終ページでは総件数で頭打ちにする', () => {
      renderPagination({ page: 3, perPage: 10, total: 25 });

      expect(screen.getByText(/全 25 件中 21–25 件/)).toBeInTheDocument();
    });

    it('0件のとき 0–0 と表示し、開始位置が総件数を超えない', () => {
      renderPagination({ page: 1, perPage: 10, total: 0 });

      expect(screen.getByText(/全 0 件中 0–0 件/)).toBeInTheDocument();
    });
  });

  describe('ページ番号の表示', () => {
    it('総ページ数を割り切れない件数から切り上げて算出する', () => {
      renderPagination({ page: 1, perPage: 10, total: 21 });

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('割り切れる件数では余分なページを作らない', () => {
      renderPagination({ page: 1, perPage: 10, total: 20 });

      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('0件のとき「1 / 1」と表示する（0ページとは表示しない）', () => {
      renderPagination({ page: 1, perPage: 10, total: 0 });

      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });
  });

  describe('ボタンの活性制御', () => {
    it('先頭ページでは先頭・前ボタンを無効にする', () => {
      const { first, prev, next, last } = renderPagination({ page: 1, perPage: 10, total: 25 });

      expect(first).toBeDisabled();
      expect(prev).toBeDisabled();
      expect(next).toBeEnabled();
      expect(last).toBeEnabled();
    });

    it('中間ページでは4つとも有効にする', () => {
      const { first, prev, next, last } = renderPagination({ page: 2, perPage: 10, total: 25 });

      expect(first).toBeEnabled();
      expect(prev).toBeEnabled();
      expect(next).toBeEnabled();
      expect(last).toBeEnabled();
    });

    it('最終ページでは次・最終ボタンを無効にする', () => {
      const { first, prev, next, last } = renderPagination({ page: 3, perPage: 10, total: 25 });

      expect(first).toBeEnabled();
      expect(prev).toBeEnabled();
      expect(next).toBeDisabled();
      expect(last).toBeDisabled();
    });

    it('0件のときは移動手段を全て無効にする', () => {
      const { first, prev, next, last } = renderPagination({ page: 1, perPage: 10, total: 0 });

      expect(first).toBeDisabled();
      expect(prev).toBeDisabled();
      expect(next).toBeDisabled();
      expect(last).toBeDisabled();
    });
  });

  describe('ページ移動', () => {
    it('前後のボタンで隣のページを要求する', async () => {
      const user = userEvent.setup();
      const { prev, next, onPageChange } = renderPagination({ page: 2, perPage: 10, total: 25 });

      await user.click(prev);
      expect(onPageChange).toHaveBeenLastCalledWith(1);

      await user.click(next);
      expect(onPageChange).toHaveBeenLastCalledWith(3);
    });

    it('先頭・最終ボタンで両端のページを要求する', async () => {
      const user = userEvent.setup();
      const { first, last, onPageChange } = renderPagination({ page: 2, perPage: 10, total: 25 });

      await user.click(first);
      expect(onPageChange).toHaveBeenLastCalledWith(1);

      await user.click(last);
      expect(onPageChange).toHaveBeenLastCalledWith(3);
    });
  });

  describe('表示件数の変更', () => {
    it('件数を変えたとき、1ページ目に戻す', async () => {
      const user = userEvent.setup();
      const { onPageChange, onPerPageChange } = renderPagination({
        page: 3,
        perPage: 10,
        total: 25,
      });

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: '50' }));

      // 3ページ目のまま件数だけ増やすと、存在しないページを表示してしまう
      expect(onPerPageChange).toHaveBeenCalledWith(50);
      expect(onPageChange).toHaveBeenCalledWith(1);
    });
  });
});
