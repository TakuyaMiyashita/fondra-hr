'use client';

import { Handshake, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import type { OneOnOne } from '@/types/one-on-one';

import { fetchOneOnOnes } from './actions';
import { OneOnOneDeleteDialog } from './one-on-one-delete-dialog';
import { OneOnOneFormDialog } from './one-on-one-form-dialog';

interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
}

interface Props {
  initialRecords: OneOnOne[];
  initialTotal: number;
  employees: EmployeeOption[];
}

function MoodBadge({ score }: { score: number }) {
  const variant =
    score >= 4 ? ('default' as const) : score >= 3 ? ('secondary' as const) : ('outline' as const);
  return <Badge variant={variant}>{score}</Badge>;
}

export function OneOnOneListClient({ initialRecords, initialTotal, employees }: Props) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<OneOnOne | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<OneOnOne | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const reload = useCallback(async (s?: string, empId?: string) => {
    const result = await fetchOneOnOnes({
      page: 1,
      perPage: 20,
      sort: 'heldOn',
      order: 'desc',
      search: s || undefined,
      employeeId: empId || undefined,
    });
    if (result.success) {
      setRecords(result.data.records);
      setTotal(result.data.total);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      reload(search, employeeFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, employeeFilter, reload]);

  function handleSuccess() {
    setCreateOpen(false);
    setEditRecord(null);
    setDeleteRecord(null);
    reload(search, employeeFilter);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">1on1記録</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          1on1を記録
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <InputGroup className="w-64">
          <InputGroupAddon align="inline-start">
            <Search className="h-4 w-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="氏名で検索"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
        </InputGroup>
        {employees.length > 0 && (
          <Select
            items={{
              __all__: 'すべての従業員',
              ...Object.fromEntries(employees.map((emp) => [emp.id, emp.fullName])),
            }}
            value={employeeFilter || '__all__'}
            onValueChange={(val) => setEmployeeFilter(!val || val === '__all__' ? '' : val)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="従業員" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">すべての従業員</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Handshake className="text-muted-foreground/50 h-12 w-12" />
          <h3 className="mt-4 text-lg font-semibold">1on1記録がありません</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            1on1ミーティングを記録して、コミュニケーションの質を向上させましょう。
          </p>
          <Button className="mt-6" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            最初の1on1を記録
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {records.map((record) => (
              <Card key={record.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="flex items-start justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{record.heldOn}</span>
                      {record.moodScore != null && <MoodBadge score={record.moodScore} />}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{record.employeeName}</span>
                      <span className="text-muted-foreground"> ← </span>
                      <span className="text-muted-foreground">{record.interviewerName}</span>
                    </div>
                    {record.notes && (
                      <p className="text-muted-foreground line-clamp-2 text-sm">{record.notes}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditRecord(record)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        編集
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteRecord(record)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">全 {total} 件</p>
        </>
      )}

      <OneOnOneFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees}
        onSuccess={handleSuccess}
      />

      {editRecord && (
        <OneOnOneFormDialog
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditRecord(null);
          }}
          defaultValues={editRecord}
          employees={employees}
          onSuccess={handleSuccess}
        />
      )}

      {deleteRecord && (
        <OneOnOneDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteRecord(null);
          }}
          recordId={deleteRecord.id}
          employeeName={deleteRecord.employeeName}
          heldOn={deleteRecord.heldOn}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
