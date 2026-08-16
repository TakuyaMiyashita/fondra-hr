'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchEmployeeSkills } from '../../actions';

interface Props {
  employeeId: string;
}

function SkillLevelBar({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-4 rounded-sm ${
            i < level ? 'bg-primary' : 'bg-muted'
          }`}
        />
      ))}
    </div>
  );
}

export function SkillsTab({ employeeId }: Props) {
  const { data: skills, isLoading } = useQuery({
    queryKey: ['employee-skills', employeeId],
    queryFn: () => fetchEmployeeSkills(employeeId),
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!skills || skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">スキルが登録されていません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          この従業員にはまだスキルが割り当てられていません。
        </p>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium">{skill.skillName}</p>
                {skill.skillCategory && (
                  <p className="text-xs text-muted-foreground">{skill.skillCategory}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <SkillLevelBar level={skill.level} />
                {skill.certifiedAt && (
                  <span className="text-xs text-muted-foreground">{skill.certifiedAt}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
