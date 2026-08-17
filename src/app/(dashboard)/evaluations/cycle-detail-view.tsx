'use client';

import {
  ArrowLeft,
  ClipboardList,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

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
import type { CycleWithEvaluations, Evaluation } from '@/types/evaluation';

import { EvaluationDeleteDialog } from './evaluation-delete-dialog';
import { EvaluationFormDialog } from './evaluation-form-dialog';
import { EvaluationEditDialog } from './evaluation-edit-dialog';

function EvalStatusBadge({ status }: { status: Evaluation['status'] }) {
  const map = {
    draft: { label: '下書き', variant: 'outline' as const },
    in_progress: { label: '入力中', variant: 'default' as const },
    submitted: { label: '提出済', variant: 'secondary' as const },
    confirmed: { label: '確定', variant: 'secondary' as const },
    returned: { label: '差戻し', variant: 'destructive' as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function RatingSummary({ ratings }: { ratings: Record<string, number> | null }) {
  if (!ratings || Object.keys(ratings).length === 0) return null;

  const values = Object.values(ratings);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return (
    <span className="text-sm text-muted-foreground">
      平均 {avg.toFixed(1)}
    </span>
  );
}

interface Props {
  detail: CycleWithEvaluations;
  employees: EmployeeOption[];
  onBack: () => void;
  onRefresh: () => void;
}

export function CycleDetailView({
  detail,
  employees,
  onBack,
  onRefresh,
}: Props) {
  const { cycle, evaluations } = detail;
  const [createOpen, setCreateOpen] = useState(false);
  const [editEval, setEditEval] = useState<Evaluation | null>(null);
  const [deleteEval, setDeleteEval] = useState<Evaluation | null>(null);

  function handleSuccess() {
    setCreateOpen(false);
    setEditEval(null);
    setDeleteEval(null);
    onRefresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{cycle.name}</h1>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          {cycle.periodStart} 〜 {cycle.periodEnd}
        </span>
        <Badge
          variant={
            cycle.status === 'in_progress'
              ? 'default'
              : cycle.status === 'completed'
                ? 'secondary'
                : 'outline'
          }
        >
          {cycle.status === 'draft'
            ? '下書き'
            : cycle.status === 'in_progress'
              ? '進行中'
              : '完了'}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          評価一覧（{evaluations.length} 件）
        </h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          評価を追加
        </Button>
      </div>

      {evaluations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">
            まだ評価が追加されていません
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            従業員と評価者を追加して評価を開始しましょう。
          </p>
          <Button className="mt-6" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            最初の評価を追加
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {evaluations.map((ev) => (
            <Card key={ev.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="flex items-start justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {ev.employeeName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({ev.employeeCode})
                    </span>
                    <EvalStatusBadge status={ev.status} />
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>評価者: {ev.evaluatorName}</span>
                    <RatingSummary ratings={ev.ratings as Record<string, number> | null} />
                  </div>
                  {ev.comment && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {ev.comment}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditEval(ev)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      評価を入力
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteEval(ev)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      削除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EvaluationFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        cycleId={cycle.id}
        employees={employees}
        onSuccess={handleSuccess}
      />

      {editEval && (
        <EvaluationEditDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditEval(null);
          }}
          evaluation={editEval}
          onSuccess={handleSuccess}
        />
      )}

      {deleteEval && (
        <EvaluationDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteEval(null);
          }}
          evaluationId={deleteEval.id}
          employeeName={deleteEval.employeeName}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
