'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Building2, Plus } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Department, DepartmentTreeNode } from '@/types/department';

import { moveDepartmentAction } from './actions';
import { DepartmentDeleteDialog } from './department-delete-dialog';
import { DepartmentFormDialog } from './department-form-dialog';
import { DepartmentTreeItem } from './department-tree-item';
import { DepartmentDropRoot } from './department-drop-root';

function findNodeById(nodes: DepartmentTreeNode[], id: string): DepartmentTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function isDescendant(nodes: DepartmentTreeNode[], parentId: string, childId: string): boolean {
  const parent = findNodeById(nodes, parentId);
  if (!parent) return false;
  if (parent.children.some((c) => c.id === childId)) return true;
  return parent.children.some((c) => isDescendant([c], c.id, childId));
}

interface Props {
  initialTree: DepartmentTreeNode[];
  departments: Department[];
}

export function DepartmentPageClient({ initialTree, departments }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<Department | undefined>(undefined);
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>(undefined);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentTreeNode | null>(null);

  const [activeNode, setActiveNode] = useState<DepartmentTreeNode | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleCreate = useCallback(() => {
    setFormMode('create');
    setEditTarget(undefined);
    setDefaultParentId(undefined);
    setFormOpen(true);
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setFormMode('create');
    setEditTarget(undefined);
    setDefaultParentId(parentId);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((node: DepartmentTreeNode) => {
    setFormMode('edit');
    setEditTarget(node);
    setDefaultParentId(undefined);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((node: DepartmentTreeNode) => {
    setDeleteTarget(node);
    setDeleteOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    setFormOpen(false);
    setDeleteOpen(false);
    router.refresh();
  }, [router]);

  function handleDragStart(event: DragStartEvent) {
    const node = event.active.data.current?.node as DepartmentTreeNode | undefined;
    setActiveNode(node ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveNode(null);

    const { active, over } = event;
    if (!over) return;

    const draggedId = active.id as string;
    const overData = over.data.current;
    const targetNode = overData?.node as DepartmentTreeNode | undefined;

    let newParentId: string | null;
    if (over.id === 'drop-root') {
      newParentId = null;
    } else if (targetNode) {
      newParentId = targetNode.id;
    } else {
      return;
    }

    const draggedNode = findNodeById(initialTree, draggedId);
    if (!draggedNode) return;

    if (draggedNode.parentId === newParentId) return;
    if (newParentId === draggedId) return;
    if (newParentId && isDescendant(initialTree, draggedId, newParentId)) return;

    startTransition(async () => {
      const result = await moveDepartmentAction(draggedId, newParentId);
      if (result.success) {
        toast.success('部署を移動しました');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const isEmpty = initialTree.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">組織図</h1>
          <p className="text-muted-foreground text-sm">
            部署の階層構造を管理します。ドラッグ&ドロップで部署を移動できます。
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isPending}>
          <Plus className="mr-2 size-4" />
          部署を追加
        </Button>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="text-muted-foreground/50 size-12" />
          <h3 className="mt-4 text-lg font-semibold">部署がまだ登録されていません</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            「部署を追加」ボタンから部署を作成して組織構造を構築しましょう。
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="rounded-md border">
            <div className="p-2">
              {initialTree.map((node) => (
                <DepartmentTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onAddChild={handleAddChild}
                />
              ))}
            </div>
            <DepartmentDropRoot />
          </div>

          <DragOverlay>
            {activeNode ? (
              <div className="bg-background flex items-center gap-2 rounded-md border px-3 py-2 shadow-lg">
                <Building2 className="text-muted-foreground size-4" />
                <span className="text-sm font-medium">{activeNode.name}</span>
                <Badge variant="secondary" className="gap-1 text-xs">
                  {activeNode.employeeCount}
                </Badge>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <DepartmentFormDialog
        mode={formMode}
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultValues={editTarget}
        defaultParentId={defaultParentId}
        departments={departments}
        onSuccess={handleSuccess}
      />

      <DepartmentDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        department={deleteTarget}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
