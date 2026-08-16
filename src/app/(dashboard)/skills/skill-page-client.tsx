'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DepartmentOption } from '@/types/employee';
import type { SkillWithCount } from '@/types/skill';

import { SkillListClient } from './skill-list-client';
import { SkillMatrixClient } from './skill-matrix-client';

interface Props {
  initialSkills: SkillWithCount[];
  initialTotal: number;
  categories: string[];
  departments: DepartmentOption[];
}

export function SkillPageClient({
  initialSkills,
  initialTotal,
  categories,
  departments,
}: Props) {
  const [activeTab, setActiveTab] = useState('list');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">スキル管理</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          <TabsTrigger value="list">スキル一覧</TabsTrigger>
          <TabsTrigger value="matrix">スキルマトリクス</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <SkillListClient
            initialSkills={initialSkills}
            initialTotal={initialTotal}
            categories={categories}
          />
        </TabsContent>
        <TabsContent value="matrix">
          <SkillMatrixClient
            categories={categories}
            departments={departments}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
