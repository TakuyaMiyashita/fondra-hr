'use client';

import {
  ChevronRight,
  ClipboardList,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EmployeeOption } from '@/types/employee';
import type { CycleWithEvaluations, EvaluationCycle } from '@/types/evaluation';

import { fetchCycleDetail, fetchCycles } from './actions';
import { CycleDeleteDialog } from './cycle-delete-dialog';
import { CycleFormDialog } from './cycle-form-dialog';
import { CycleDetailView } from './cycle-detail-view';

function StatusBadge({ status }: { status: EvaluationCycle['status'] }) {
  const map = {
    draft: { label: '下書き', variant: 'outline' as const },
    in_progress: { label: '進行中', variant: 'default' as const },
    completed: { label: '完了', variant: 'secondary' as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

interface Props {
  initialCycles: EvaluationCycle[];
  employees: EmployeeOption[];
}

export function EvaluationPageClient({ initialCycles, employees }: Props) {
  const router = useRouter();
  const [cycles, setCycles] = useState(initialCycles);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCycle, setEditCycle] = useState<EvaluationCycle | null>(null);
  const [deleteCycle, setDeleteCycle] = useState<EvaluationCycle | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CycleWithEvaluations | null>(null);

  const reload = useCallback(async () => {
    const result = await fetchCycles();
    if (result.success) {
      setCycles(result.data);
    }
  }, []);

  function handleSuccess() {
    setCreateOpen(false);
    setEditCycle(null);
    setDeleteCycle(null);
    setSelectedDetail(null);
    reload();
    router.refresh();
  }

  async function handleSelectCycle(cycle: EvaluationCycle) {
    const result = await fetchCycleDetail(cycle.id);
    if (result.success) {
      setSelectedDetail(result.data);
    }
  }

  if (selectedDetail) {
    return (
      <CycleDetailView
        detail={selectedDetail}
        employees={employees}
        onBack={() => setSelectedDetail(null)}
        onRefresh={async () => {
          const result = await fetchCycleDetail(selectedDetail.cycle.id);
          if (result.success) {
            setSelectedDetail(result.data);
          }
          reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">評価</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          評価サイクルを作成
        </Button>
      </div>

      {cycles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">
            評価サイクルがまだ作成されていません
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            評価サイクルを作成して、体系的な人事評価を開始しましょう。
          </p>
          <Button className="mt-6" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            最初の評価サイクルを作成
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {cycles.map((cycle) => (
            <Card
              key={cycle.id}
              className="hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => handleSelectCycle(cycle)}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cycle.name}</span>
                    <StatusBadge status={cycle.status} />
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      {cycle.periodStart} 〜 {cycle.periodEnd}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {cycle.evaluationCount} 件
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setEditCycle(cycle);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        編集
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setDeleteCycle(cycle);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CycleFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleSuccess}
      />

      {editCycle && (
        <CycleFormDialog
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditCycle(null);
          }}
          defaultValues={editCycle}
          onSuccess={handleSuccess}
        />
      )}

      {deleteCycle && (
        <CycleDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteCycle(null);
          }}
          cycleId={deleteCycle.id}
          cycleName={deleteCycle.name}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
