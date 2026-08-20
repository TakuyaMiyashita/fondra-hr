'use client';

import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ButtonLink } from '@/components/shared/button-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DepartmentOption, EmployeeDetail } from '@/types/employee';

import { EmployeeDeleteDialog } from '../employee-delete-dialog';
import { EmployeeFormSheet } from '../employee-form-sheet';

import { AvatarUpload } from './avatar-upload';
import { BasicInfoTab } from './tabs/basic-info-tab';
import { EvaluationsTab } from './tabs/evaluations-tab';
import { OneOnOneTab } from './tabs/one-on-one-tab';
import { SkillsTab } from './tabs/skills-tab';

const statusConfig = {
  active: { label: '在籍', variant: 'default' as const },
  inactive: { label: '休職', variant: 'secondary' as const },
  retired: { label: '退職', variant: 'outline' as const },
};

interface Props {
  employee: EmployeeDetail;
  departments: DepartmentOption[];
}

export function EmployeeDetailClient({ employee, departments }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const statusInfo = statusConfig[employee.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ButtonLink variant="ghost" size="icon-sm" href="/employees" aria-label="従業員一覧に戻る">
          <ArrowLeft />
        </ButtonLink>
        <h1 className="text-2xl font-bold tracking-tight">従業員詳細</h1>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <AvatarUpload
            employeeId={employee.id}
            fullName={employee.fullName}
            avatarPath={employee.avatarPath}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{employee.fullName}</h2>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{employee.employeeCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            編集
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            削除
          </Button>
        </div>
      </div>

      <Tabs defaultValue="basic">
        <TabsList variant="line">
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="skills">スキル</TabsTrigger>
          <TabsTrigger value="one-on-ones">1on1</TabsTrigger>
          <TabsTrigger value="evaluations">評価</TabsTrigger>
        </TabsList>
        <TabsContent value="basic">
          <BasicInfoTab employee={employee} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab employeeId={employee.id} />
        </TabsContent>
        <TabsContent value="one-on-ones">
          <OneOnOneTab employeeId={employee.id} />
        </TabsContent>
        <TabsContent value="evaluations">
          <EvaluationsTab employeeId={employee.id} />
        </TabsContent>
      </Tabs>

      <EmployeeFormSheet
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        defaultValues={employee}
        departments={departments}
        onSuccess={() => {
          setEditOpen(false);
          router.refresh();
        }}
      />

      <EmployeeDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        employeeId={employee.id}
        employeeName={employee.fullName}
        onSuccess={() => {
          setDeleteOpen(false);
          router.push('/employees');
        }}
      />
    </div>
  );
}
