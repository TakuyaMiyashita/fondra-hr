'use client';

import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Props {
  changes: Record<string, unknown>;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(なし)';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export function AuditLogChangesPopover({ changes }: Props) {
  const entries = Object.entries(changes);

  if (entries.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const isChangeLog = entries.some(
    ([, v]) =>
      typeof v === 'object' &&
      v !== null &&
      'from' in (v as Record<string, unknown>) &&
      'to' in (v as Record<string, unknown>),
  );

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <Eye className="mr-1.5 h-3.5 w-3.5" />
        {entries.length} 項目
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">変更内容</h4>
          <div className="max-h-60 overflow-y-auto space-y-1.5">
            {entries.map(([key, value]) => {
              if (
                isChangeLog &&
                typeof value === 'object' &&
                value !== null &&
                'from' in (value as Record<string, unknown>)
              ) {
                const { from, to } = value as { from: unknown; to: unknown };
                return (
                  <div key={key} className="text-xs">
                    <span className="font-medium">{key}</span>
                    <div className="ml-2 text-muted-foreground">
                      <span className="line-through">{formatValue(from)}</span>
                      {' → '}
                      <span>{formatValue(to)}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={key} className="text-xs">
                  <span className="font-medium">{key}</span>
                  {': '}
                  <span className="text-muted-foreground">
                    {formatValue(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
