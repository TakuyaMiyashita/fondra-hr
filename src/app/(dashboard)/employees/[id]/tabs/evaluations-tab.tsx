'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchEmployeeEvaluations } from '../../actions';

interface Props {
  employeeId: string;
}

const evalStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  draft: { label: '下書き', variant: 'outline' },
  in_progress: { label: '進行中', variant: 'secondary' },
  submitted: { label: '提出済み', variant: 'default' },
  confirmed: { label: '確定', variant: 'default' },
  returned: { label: '差戻し', variant: 'outline' },
};

export function EvaluationsTab({ employeeId }: Props) {
  const { data: evaluations, isLoading } = useQuery({
    queryKey: ['employee-evaluations', employeeId],
    queryFn: () => fetchEmployeeEvaluations(employeeId),
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!evaluations || evaluations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="text-muted-foreground/50 h-12 w-12" />
        <h3 className="mt-4 text-lg font-semibold">評価記録がありません</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          この従業員の評価記録はまだ登録されていません。
        </p>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {evaluations.map((evaluation) => {
            const statusInfo = evalStatusConfig[evaluation.status] ?? {
              label: evaluation.status,
              variant: 'outline' as const,
            };
            return (
              <div
                key={evaluation.id}
                className="border-border border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{evaluation.cycleName}</p>
                    <p className="text-muted-foreground text-xs">
                      評価者: {evaluation.evaluatorName}
                    </p>
                  </div>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                {evaluation.comment && (
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {evaluation.comment}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
