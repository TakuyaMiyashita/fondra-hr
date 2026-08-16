'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { EmployeeDetail } from '@/types/employee';

const statusConfig = {
  active: { label: '在籍', variant: 'default' as const },
  inactive: { label: '休職', variant: 'secondary' as const },
  retired: { label: '退職', variant: 'outline' as const },
};

interface Props {
  employee: EmployeeDetail;
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export function BasicInfoTab({ employee }: Props) {
  const statusInfo = statusConfig[employee.status];

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <InfoItem label="社員番号" value={employee.employeeCode} />
          <InfoItem label="氏名" value={employee.fullName} />
          <InfoItem label="フリガナ" value={employee.fullNameKana} />
          <InfoItem label="メールアドレス" value={employee.email} />
          <InfoItem label="部署" value={employee.departmentName} />
          <InfoItem label="役職" value={employee.position} />
          <InfoItem label="入社日" value={employee.hiredOn} />
          <InfoItem label="生年月日" value={employee.birthDate} />
          <InfoItem
            label="ステータス"
            value={<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
          />
        </dl>
      </CardContent>
    </Card>
  );
}
