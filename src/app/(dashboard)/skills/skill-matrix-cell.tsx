'use client';

import { Loader2, X } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { assignSkillAction, removeSkillAssignmentAction } from './actions';

const LEVEL_STYLES = [
  '',
  'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-300',
] as const;

const LEVEL_LABELS = ['', '初級', '基礎', '中級', '上級', '熟練'] as const;

interface Props {
  employeeId: string;
  skillId: string;
  level: number | null;
  onUpdate: () => void;
}

export function SkillMatrixCell({ employeeId, skillId, level, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleLevelChange(newLevel: number) {
    startTransition(async () => {
      const result = await assignSkillAction({
        employeeId,
        skillId,
        level: newLevel,
      });
      if (result.success) {
        onUpdate();
        setOpen(false);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeSkillAssignmentAction(employeeId, skillId);
      if (result.success) {
        onUpdate();
        setOpen(false);
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            className={cn(
              'flex h-8 w-full items-center justify-center rounded text-xs font-medium transition-colors',
              level
                ? LEVEL_STYLES[level]
                : 'text-muted-foreground/30 hover:bg-muted/50',
            )}
          />
        }
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : level ? (
          level
        ) : (
          '—'
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="center">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((l) => (
            <Button
              key={l}
              variant={level === l ? 'default' : 'outline'}
              size="sm"
              className="h-8 w-14 text-xs"
              disabled={isPending}
              onClick={() => handleLevelChange(l)}
            >
              {l} {LEVEL_LABELS[l]}
            </Button>
          ))}
          {level && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-1 text-destructive"
              disabled={isPending}
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
