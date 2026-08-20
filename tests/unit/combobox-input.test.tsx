import { render, screen } from '@testing-library/react';
import * as React from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComboboxInput } from '@/components/shared/combobox-input';

const GROUPS = [
  { value: 'インフラ', items: ['AWS', 'Terraform'] },
  { value: 'データ', items: ['SQL分析'] },
];

/**
 * value は制御プロパティで、絞り込みもこの値を基準に行われる。
 * 固定値のまま渡すとフィルタが一切効かず、テストが実装より緩くなる。
 */
function Harness({ onValueChange }: { onValueChange: (v: string, picked: boolean) => void }) {
  const [value, setValue] = React.useState('');
  return (
    <ComboboxInput
      id="skill-name"
      value={value}
      onValueChange={(v, picked) => {
        setValue(v);
        onValueChange(v, picked);
      }}
      groups={GROUPS}
      placeholder="React"
    />
  );
}

function setup() {
  const onValueChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onValueChange={onValueChange} />);
  return { user, onValueChange, input: screen.getByRole('combobox') };
}

describe('ComboboxInput', () => {
  it('id をそのまま入力に渡す（e2e が #id で掴んでいるため）', () => {
    const { input } = setup();

    expect(input).toHaveAttribute('id', 'skill-name');
  });

  it('入力すると候補が絞り込まれ、グループ見出しも出る', async () => {
    const { user, input } = setup();

    await user.click(input);
    await user.type(input, 'Terra');

    expect(await screen.findByRole('option', { name: 'Terraform' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'SQL分析' })).not.toBeInTheDocument();
  });

  it('候補を選んだとき picked=true で返す', async () => {
    const { user, onValueChange, input } = setup();

    await user.click(input);
    await user.type(input, 'Terra');
    await user.click(await screen.findByRole('option', { name: 'Terraform' }));

    expect(onValueChange).toHaveBeenLastCalledWith('Terraform', true);
  });

  it('自由入力では picked=false で返す（候補に飲み込まれない）', async () => {
    const { user, onValueChange, input } = setup();

    await user.type(input, '社');

    expect(onValueChange).toHaveBeenLastCalledWith('社', false);
  });

  it('候補が1件も無いときはポップアップを出さない', async () => {
    // 空の箱がフォームの送信ボタンを覆うと、自由入力した値を登録できなくなる
    const { user, input } = setup();

    await user.click(input);
    await user.type(input, 'zzzz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
