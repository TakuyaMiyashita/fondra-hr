'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { DepartmentOption } from '@/types/employee';

import { fetchSkillMatrix } from './actions';
import { SkillMatrixCell } from './skill-matrix-cell';

interface Props {
  categories: string[];
  departments: DepartmentOption[];
}

export function SkillMatrixClient({ categories, departments }: Props) {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const queryKey = ['skill-matrix', departmentId, category, debouncedSearch];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await fetchSkillMatrix({
        departmentId: departmentId || undefined,
        category: category || undefined,
        search: debouncedSearch || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  const handleCellUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['skill-matrix'] });
  }, [queryClient]);

  const cellMap = new Map<string, number>();
  if (data) {
    for (const cell of data.cells) {
      cellMap.set(`${cell.employeeId}:${cell.skillId}`, cell.level);
    }
  }

  const groupedSkills: { category: string; skills: typeof data extends undefined ? never : NonNullable<typeof data>['skills'] }[] = [];
  if (data) {
    const catMap = new Map<string, typeof data.skills>();
    for (const skill of data.skills) {
      const cat = skill.category || '未分類';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(skill);
    }
    for (const [cat, skls] of catMap) {
      groupedSkills.push({ category: cat, skills: skls });
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <InputGroup className="w-64">
          <InputGroupAddon align="inline-start">
            <Search className="h-4 w-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="従業員名で検索"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
        </InputGroup>
        {departments.length > 0 && (
          <Select
            value={departmentId || '__all__'}
            onValueChange={(val) => setDepartmentId(!val || val === '__all__' ? '' : val)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="部署" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">すべての部署</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {categories.length > 0 && (
          <Select
            value={category || '__all__'}
            onValueChange={(val) => setCategory(!val || val === '__all__' ? '' : val)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">すべて</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data || (data.employees.length === 0 && data.skills.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">マトリクスデータがありません</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            スキル一覧タブでスキルを追加し、従業員を登録してください。
          </p>
        </div>
      ) : data.skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">スキルが登録されていません</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            先にスキル一覧タブでスキルを追加してください。
          </p>
        </div>
      ) : data.employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">該当する従業員がいません</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            フィルタ条件を変更するか、従業員を登録してください。
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 z-20 bg-muted">
                <th
                  className="sticky left-0 z-30 min-w-[200px] border-b border-r border-border bg-muted px-3 py-2 text-left font-medium"
                  rowSpan={groupedSkills.some((g) => g.category !== '未分類') ? 2 : 1}
                >
                  従業員
                </th>
                {groupedSkills.map((group) => (
                  <th
                    key={group.category}
                    colSpan={group.skills.length}
                    className="border-b border-r border-border px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                  >
                    {group.category}
                  </th>
                ))}
              </tr>
              {groupedSkills.some((g) => g.category !== '未分類') && (
                <tr className="sticky top-[33px] z-20 bg-muted">
                  {groupedSkills.flatMap((group) =>
                    group.skills.map((skill) => (
                      <th
                        key={skill.id}
                        className="min-w-[72px] border-b border-r border-border px-2 py-1.5 text-center text-xs font-medium"
                      >
                        {skill.name}
                      </th>
                    )),
                  )}
                </tr>
              )}
              {!groupedSkills.some((g) => g.category !== '未分類') && (
                <tr className="sticky top-[33px] z-20 bg-muted">
                  {data.skills.map((skill) => (
                    <th
                      key={skill.id}
                      className="min-w-[72px] border-b border-r border-border px-2 py-1.5 text-center text-xs font-medium"
                    >
                      {skill.name}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {data.employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-background px-3 py-1.5">
                    <div className="font-medium">{emp.fullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {emp.employeeCode}
                      {emp.departmentName && ` · ${emp.departmentName}`}
                    </div>
                  </td>
                  {groupedSkills.flatMap((group) =>
                    group.skills.map((skill) => (
                      <td
                        key={skill.id}
                        className="border-b border-r border-border px-1 py-1"
                      >
                        <SkillMatrixCell
                          employeeId={emp.id}
                          skillId={skill.id}
                          level={cellMap.get(`${emp.id}:${skill.id}`) ?? null}
                          onUpdate={handleCellUpdate}
                        />
                      </td>
                    )),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
