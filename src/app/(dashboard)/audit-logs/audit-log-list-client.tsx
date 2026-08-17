'use client';

import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { AuditLog } from '@/types/audit-log';

import { fetchAuditLogs } from './actions';
import { AuditLogChangesPopover } from './audit-log-changes-popover';

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  employee: '従業員',
  department: '部署',
  skill: 'スキル',
  employee_skill: 'スキル割当',
  one_on_one: '1on1',
  evaluation_cycle: '評価サイクル',
  evaluation: '評価',
  organization: '組織',
  membership: 'メンバー',
  invitation: '招待',
};

const ACTION_LABELS: Record<string, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
};

function formatAction(action: string): string {
  const parts = action.split('.');
  const verb = parts[parts.length - 1];
  return ACTION_LABELS[verb] ?? verb;
}

function formatResourceType(type: string): string {
  return RESOURCE_TYPE_LABELS[type] ?? type;
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ActionBadge({ action }: { action: string }) {
  const verb = action.split('.').pop() ?? action;
  const variant =
    verb === 'create'
      ? ('default' as const)
      : verb === 'delete'
        ? ('destructive' as const)
        : ('secondary' as const);
  return <Badge variant={variant}>{formatAction(action)}</Badge>;
}

interface Props {
  initialLogs: AuditLog[];
  initialTotal: number;
  resourceTypes: string[];
}

export function AuditLogListClient({ initialLogs, initialTotal, resourceTypes }: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const perPage = 20;
  const totalPages = Math.ceil(total / perPage);

  const reload = useCallback(async (p: number, rt?: string) => {
    const result = await fetchAuditLogs({
      page: p,
      perPage,
      order: 'desc',
      resourceType: rt || undefined,
    });
    if (result.success) {
      setLogs(result.data.logs);
      setTotal(result.data.total);
    }
  }, []);

  function handleResourceTypeChange(val: string | null) {
    const rt = !val || val === '__all__' ? '' : val;
    setResourceTypeFilter(rt);
    setPage(1);
    reload(1, rt);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    reload(newPage, resourceTypeFilter);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">監査ログ</h1>

      <div className="flex items-center gap-2">
        {resourceTypes.length > 0 && (
          <Select
            items={{
              __all__: 'すべて',
              ...Object.fromEntries(resourceTypes.map((rt) => [rt, formatResourceType(rt)])),
            }}
            value={resourceTypeFilter || '__all__'}
            onValueChange={handleResourceTypeChange}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="リソース種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">すべて</SelectItem>
              {resourceTypes.map((rt) => (
                <SelectItem key={rt} value={rt}>
                  {formatResourceType(rt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="text-muted-foreground/50 h-12 w-12" />
          <h3 className="mt-4 text-lg font-semibold">監査ログがまだありません</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            データの変更が行われると、自動的にここに記録されます。
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">日時</TableHead>
                  <TableHead className="w-48">操作者</TableHead>
                  <TableHead className="w-28">リソース</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                  <TableHead>変更内容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{log.actorEmail ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatResourceType(log.resourceType)}</Badge>
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell>
                      {log.changes ? (
                        <AuditLogChangesPopover changes={log.changes} />
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              全 {total} 件中 {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} 件
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
