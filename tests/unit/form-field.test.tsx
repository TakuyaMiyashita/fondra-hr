import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormError, FormField, FormLabel } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * このリポジトリでは以前 aria-invalid / aria-describedby が全ソースで0件で、
 * バリデーションエラーが支援技術に届いていなかった。FormField はそれを
 * Base UI の Field に委ねて解決するためのもの。
 *
 * ここで検証するのは「配線されていること」そのもの。実装を Base UI に
 * 任せている以上、上流の破壊的変更を検知できるのはこのテストしかない。
 */
describe('FormField', () => {
  it('ラベルを入力に関連付ける', () => {
    render(
      <FormField>
        <FormLabel htmlFor="skill-name">スキル名</FormLabel>
        <Input id="skill-name" />
      </FormField>,
    );

    expect(screen.getByLabelText('スキル名')).toHaveAttribute('id', 'skill-name');
  });

  it('invalid のとき入力に aria-invalid が立つ', () => {
    render(
      <FormField invalid>
        <FormLabel htmlFor="skill-name">スキル名</FormLabel>
        <Input id="skill-name" />
        <FormError>スキル名を入力してください</FormError>
      </FormField>,
    );

    expect(screen.getByLabelText('スキル名')).toHaveAttribute('aria-invalid', 'true');
  });

  it('エラーメッセージを aria-describedby で入力に結びつける', () => {
    render(
      <FormField invalid>
        <FormLabel htmlFor="skill-name">スキル名</FormLabel>
        <Input id="skill-name" />
        <FormError>スキル名を入力してください</FormError>
      </FormField>,
    );

    const input = screen.getByLabelText('スキル名');
    const describedBy = input.getAttribute('aria-describedby');

    // 隣に <p> を置くだけでは読み上げられない。id で結ばれている必要がある。
    expect(describedBy).toBeTruthy();
    const message = document.getElementById(describedBy!);
    expect(message).toHaveTextContent('スキル名を入力してください');
  });

  it('エラーが無いときはメッセージを描画しない', () => {
    render(
      <FormField>
        <FormLabel htmlFor="skill-name">スキル名</FormLabel>
        <Input id="skill-name" />
        <FormError>{undefined}</FormError>
      </FormField>,
    );

    expect(screen.getByLabelText('スキル名')).not.toHaveAttribute('aria-describedby');
  });

  it('Select にも名前が付く（htmlFor を書かなくても Field 経由で繋がる）', () => {
    const items = { admin: '管理者', member: 'メンバー' };
    render(
      <FormField>
        <FormLabel>ロール</FormLabel>
        <Select items={items} defaultValue="member">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(items).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>,
    );

    // Label 14件の欠落のうち Select 12件は、囲むだけで解決するという前提の検証
    expect(screen.getByRole('combobox', { name: 'ロール' })).toBeInTheDocument();
  });
});
