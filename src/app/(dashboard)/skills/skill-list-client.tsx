'use client';

import { MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { roleAtLeast } from '@/lib/roles';
import type { Role } from '@/services/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SkillWithCount } from '@/types/skill';

import { fetchSkills } from './actions';
import { SkillDeleteDialog } from './skill-delete-dialog';
import { SkillFormDialog } from './skill-form-dialog';

interface Props {
  /** ボタンの出し分けに使う。防御の本体は Service Layer。 */
  role: Role;
  initialSkills: SkillWithCount[];
  initialTotal: number;
  categories: string[];
}

export function SkillListClient({ initialSkills, initialTotal, categories, role }: Props) {
  // スキルの作成は member 以上（docs/database/authorization-matrix.md）。viewer は閲覧のみ。
  const canCreate = roleAtLeast(role, 'member');
  const router = useRouter();
  const [skills, setSkills] = useState(initialSkills);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<SkillWithCount | null>(null);
  const [deleteSkill, setDeleteSkill] = useState<SkillWithCount | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const reload = useCallback(async (s?: string, cat?: string) => {
    const result = await fetchSkills({
      page: 1,
      perPage: 50,
      search: s || undefined,
      category: cat || undefined,
    });
    if (result.success) {
      setSkills(result.data.skills);
      setTotal(result.data.total);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      reload(search, categoryFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, categoryFilter, reload]);

  function handleSuccess() {
    setCreateOpen(false);
    setEditSkill(null);
    setDeleteSkill(null);
    reload(search, categoryFilter);
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <InputGroup className="w-64">
            <InputGroupAddon align="inline-start">
              <Search className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="スキル名で検索"
              aria-label="スキル名で検索"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </InputGroup>
          {categories.length > 0 && (
            <Select
              items={{ __all__: 'すべて', ...Object.fromEntries(categories.map((c) => [c, c])) }}
              value={categoryFilter || '__all__'}
              onValueChange={(val) => setCategoryFilter(!val || val === '__all__' ? '' : val)}
            >
              <SelectTrigger className="w-40" aria-label="カテゴリで絞り込み">
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
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            スキルを追加
          </Button>
        )}
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="text-muted-foreground/50 h-12 w-12" />
          <h3 className="mt-4 text-lg font-semibold">スキルが登録されていません</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            組織のスキルを定義して、従業員に割り当てましょう。
          </p>
          {canCreate && (
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              最初のスキルを追加
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>スキル名</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead className="text-right">割当人数</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.map((skill) => (
                  <TableRow key={skill.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{skill.name}</TableCell>
                    <TableCell>
                      {skill.category ? (
                        <Badge variant="secondary">{skill.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {skill.employeeCount > 0 ? (
                        <Badge variant="outline">{skill.employeeCount}人</Badge>
                      ) : (
                        <span className="text-muted-foreground">0人</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`${skill.name} の操作`}
                          render={<Button variant="ghost" size="icon-sm" />}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditSkill(skill)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            編集
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteSkill(skill)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground text-xs">全 {total} 件</p>
        </>
      )}

      <SkillFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories}
        onSuccess={handleSuccess}
      />

      {editSkill && (
        <SkillFormDialog
          mode="edit"
          open={true}
          categories={categories}
          onOpenChange={(open) => {
            if (!open) setEditSkill(null);
          }}
          defaultValues={editSkill}
          onSuccess={handleSuccess}
        />
      )}

      {deleteSkill && (
        <SkillDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteSkill(null);
          }}
          skillId={deleteSkill.id}
          skillName={deleteSkill.name}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
