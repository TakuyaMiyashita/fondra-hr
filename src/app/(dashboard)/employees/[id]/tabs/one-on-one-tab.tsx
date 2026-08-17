'use client';

import { useQuery } from '@tanstack/react-query';
import { Handshake } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchEmployeeOneOnOnes } from '../../actions';

interface Props {
  employeeId: string;
}

function MoodBadge({ score }: { score: number }) {
  const config =
    score >= 4
      ? { label: `${score}`, variant: 'default' as const }
      : score >= 3
        ? { label: `${score}`, variant: 'secondary' as const }
        : { label: `${score}`, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function OneOnOneTab({ employeeId }: Props) {
  const { data: records, isLoading } = useQuery({
    queryKey: ['employee-one-on-ones', employeeId],
    queryFn: () => fetchEmployeeOneOnOnes(employeeId),
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

  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Handshake className="text-muted-foreground/50 h-12 w-12" />
        <h3 className="mt-4 text-lg font-semibold">1on1記録がありません</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          この従業員の1on1記録はまだ登録されていません。
        </p>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {records.map((record) => (
            <div key={record.id} className="border-border border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{record.heldOn}</span>
                  <span className="text-muted-foreground text-xs">
                    面談者: {record.interviewerName}
                  </span>
                </div>
                {record.moodScore != null && <MoodBadge score={record.moodScore} />}
              </div>
              {record.notes && (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{record.notes}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
