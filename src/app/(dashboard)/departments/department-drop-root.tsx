'use client';

import { useDroppable } from '@dnd-kit/core';
import { ArrowUpToLine } from 'lucide-react';

import { cn } from '@/lib/utils';

export function DepartmentDropRoot() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop-root',
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'text-muted-foreground mx-2 mb-2 flex items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm transition-colors',
        isOver && 'border-primary bg-primary/10 text-primary',
      )}
    >
      <ArrowUpToLine className="size-4" />
      ここにドロップでルート部署に移動
    </div>
  );
}
