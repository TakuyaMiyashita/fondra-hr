'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  Building2,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { DepartmentTreeNode } from '@/types/department';

interface DepartmentTreeItemProps {
  node: DepartmentTreeNode;
  depth: number;
  onEdit: (node: DepartmentTreeNode) => void;
  onDelete: (node: DepartmentTreeNode) => void;
  onAddChild: (parentId: string) => void;
}

export function DepartmentTreeItem({
  node,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: DepartmentTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: node.id,
    data: { node },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${node.id}`,
    data: { node },
  });

  return (
    <div ref={setDropRef}>
      <div
        ref={setDragRef}
        className={cn(
          'group hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5',
          isDragging && 'opacity-50',
          isOver && 'bg-primary/10 ring-primary/30 ring-2',
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`${node.name} を並べ替え`}
        >
          <GripVertical className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-sm',
            !hasChildren && 'invisible',
          )}
          aria-expanded={expanded}
          aria-label={expanded ? `${node.name} の子部署を閉じる` : `${node.name} の子部署を開く`}
        >
          <ChevronRight
            className={cn('size-4 transition-transform duration-200', expanded && 'rotate-90')}
          />
        </button>

        <Building2 className="text-muted-foreground size-4 shrink-0" />

        <span className="flex-1 truncate text-sm font-medium">{node.name}</span>

        <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
          <Users className="size-3" />
          {node.employeeCount}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${node.name} の操作`}
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddChild(node.id)}>
              <Plus className="mr-2 size-4" />
              子部署を追加
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(node)}>
              <Pencil className="mr-2 size-4" />
              編集
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(node)}
            >
              <Trash2 className="mr-2 size-4" />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <DepartmentTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}
