'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SuggestionGroup } from '@/lib/constants/skill-presets';

/**
 * 候補から選べるが、自由入力もできる入力欄。
 *
 * **Base UI の `Combobox` ではなく `Autocomplete` を使う。** 公式ドキュメントが
 * 「Combobox does not allow free-form text input」と明記しており、
 * 「候補 + 自由入力」の要件に合うのは Autocomplete のほう
 * （node_modules/@base-ui/react/docs/react/components/autocomplete.md）。
 *
 * **`id` を必須にしている。** Base UI の自動生成に任せると、`#skill-name` を
 * 掴んでいる e2e が壊れる。`FormLabel` の `htmlFor` 先としても要る。
 */
export interface ComboboxInputProps {
  id: string;
  value: string;
  /** `picked` は候補から選んだときだけ true。自由入力では false。 */
  onValueChange: (value: string, picked: boolean) => void;
  groups: readonly SuggestionGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ComboboxInput({
  id,
  value,
  onValueChange,
  groups,
  placeholder,
  disabled,
  className,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false);

  // 候補が1件も無いときはポップアップを出さない。空の箱がフォームの
  // 送信ボタンを覆い、自由入力した値をそのまま登録できなくなるため。
  const query = value.trim().toLowerCase();
  const hasMatches = groups.some((g) => g.items.some((item) => item.toLowerCase().includes(query)));

  return (
    <Autocomplete.Root
      items={groups}
      open={open && hasMatches}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(next, details) => {
        const picked = details.reason === 'item-press' || details.reason === 'list-navigation';
        onValueChange(next, picked);
      }}
    >
      {/* render で ui/input.tsx のスタイルを流用する。中身は Field.Control なので
          FormField 配下なら aria-invalid / aria-describedby もそのまま効く。 */}
      <Autocomplete.Input
        id={id}
        disabled={disabled}
        placeholder={placeholder}
        render={<Input className={className} />}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="isolate z-50">
          <Autocomplete.Popup
            className={cn(
              'bg-popover text-popover-foreground ring-foreground/10 z-50 max-h-64 w-(--anchor-width) origin-(--transform-origin)',
              'overflow-y-auto rounded-lg p-1 text-sm shadow-md ring-1 outline-hidden',
            )}
          >
            <Autocomplete.List>
              {(group: SuggestionGroup) => (
                <Autocomplete.Group key={group.value} items={group.items} className="block">
                  <Autocomplete.GroupLabel className="text-muted-foreground px-2 py-1.5 text-xs select-none">
                    {group.value}
                  </Autocomplete.GroupLabel>
                  {group.items.map((item) => (
                    <Autocomplete.Item
                      key={item}
                      value={item}
                      className="data-highlighted:bg-muted data-highlighted:text-foreground relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none"
                    >
                      {item}
                    </Autocomplete.Item>
                  ))}
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
