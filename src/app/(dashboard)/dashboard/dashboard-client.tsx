'use client';

import {
  Building2,
  ClipboardList,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardStats, RecentActivity } from '@/types/dashboard';

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

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;
  return d.toLocaleDateString('ja-JP');
}

function ActionBadge({ action }: { action: string }) {
  const verb = action.split('.').pop() ?? action;
  const variant =
    verb === 'create'
      ? ('default' as const)
      : verb === 'delete'
        ? ('destructive' as const)
        : ('secondary' as const);
  return (
    <Badge variant={variant} className="text-xs">
      {formatAction(action)}
    </Badge>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  href: string;
}

function StatCard({ title, value, icon: Icon, href }: StatCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:bg-muted/30 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface Props {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
}

export function DashboardClient({ stats, recentActivity }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="従業員数"
          value={stats.employeeCount}
          icon={Users}
          href="/employees"
        />
        <StatCard
          title="部署数"
          value={stats.departmentCount}
          icon={Building2}
          href="/departments"
        />
        <StatCard
          title="スキル数"
          value={stats.skillCount}
          icon={Sparkles}
          href="/skills"
        />
        <StatCard
          title="進行中の評価サイクル"
          value={stats.activeCycleCount}
          icon={ClipboardList}
          href="/evaluations"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">最近のアクティビティ</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              まだアクティビティがありません
            </p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <ActionBadge action={activity.action} />
                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        {formatResourceType(activity.resourceType)}
                      </span>
                      {activity.actorEmail && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          by {activity.actorEmail}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
