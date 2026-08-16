'use client';

import { Building2, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type { Department, DepartmentTreeNode } from '@/types/department';

import { DepartmentDeleteDialog } from './department-delete-dialog';
import { DepartmentFormDialog } from './department-form-dialog';
import { DepartmentTreeItem } from './department-tree-item';

interface Props {
  initialTree: DepartmentTreeNode[];
  departments: Department[];
}

export function DepartmentPageClient({ initialTree, departments }: Props) {
  const router = useRouter();

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<Department | undefined>(undefined);
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>(
    undefined,
  );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentTreeNode | null>(
    null,
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

  const isEmpty = initialTree.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">組織図</h1>
          <p className="text-sm text-muted-foreground">
            部署の階層構造を管理します
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 size-4" />
          部署を追加
        </Button>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="size-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">
            部署がまだ登録されていません
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            「部署を追加」ボタンから部署を作成して組織構造を構築しましょう。
          </p>
        </div>
      ) : (
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
        </div>
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
