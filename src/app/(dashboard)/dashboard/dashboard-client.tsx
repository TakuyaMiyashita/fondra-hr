'use client';

import { Building2, ClipboardList, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  DashboardStats,
  DepartmentHeadcount,
  EmployeeStatusCount,
  RecentActivity,
  SkillCategoryCount,
} from '@/types/dashboard';

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

const STATUS_LABELS: Record<string, string> = {
  active: '在籍',
  inactive: '休職',
  retired: '退職',
};

const CHART_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(262, 83%, 58%)',
  'hsl(330, 81%, 60%)',
  'hsl(24, 94%, 53%)',
  'hsl(142, 71%, 45%)',
  'hsl(47, 96%, 53%)',
  'hsl(199, 89%, 48%)',
  'hsl(349, 89%, 60%)',
];

const STATUS_COLORS: Record<string, string> = {
  active: 'hsl(142, 71%, 45%)',
  inactive: 'hsl(47, 96%, 53%)',
  retired: 'hsl(0, 72%, 51%)',
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
          <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
          <Icon className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DepartmentChart({ data }: { data: DepartmentHeadcount[] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">部署データがありません</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value) => [`${value}人`, '人数']}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SkillCategoryChart({ data }: { data: SkillCategoryCount[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">スキルデータがありません</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="category"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          label={({ name, value }) => `${name} (${value})`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value) => [`${value}件`, 'スキル割当数']}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmployeeStatusChart({ data }: { data: EmployeeStatusCount[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">従業員データがありません</p>
    );
  }

  const labeled = data.map((d) => ({
    ...d,
    label: STATUS_LABELS[d.status] ?? d.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={labeled}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          label={({ name, value }) => `${name} (${value})`}
        >
          {labeled.map((entry, i) => (
            <Cell
              key={i}
              fill={STATUS_COLORS[entry.status] ?? CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value) => [`${value}人`, '人数']}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface Props {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  departmentHeadcounts: DepartmentHeadcount[];
  skillCategories: SkillCategoryCount[];
  employeeStatuses: EmployeeStatusCount[];
}

export function DashboardClient({
  stats,
  recentActivity,
  departmentHeadcounts,
  skillCategories,
  employeeStatuses,
}: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="従業員数" value={stats.employeeCount} icon={Users} href="/employees" />
        <StatCard
          title="部署数"
          value={stats.departmentCount}
          icon={Building2}
          href="/departments"
        />
        <StatCard title="スキル数" value={stats.skillCount} icon={Sparkles} href="/skills" />
        <StatCard
          title="進行中の評価サイクル"
          value={stats.activeCycleCount}
          icon={ClipboardList}
          href="/evaluations"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">部署別人数</CardTitle>
          </CardHeader>
          <CardContent>
            <DepartmentChart data={departmentHeadcounts} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">従業員ステータス</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeStatusChart data={employeeStatuses} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">スキルカテゴリ分布</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillCategoryChart data={skillCategories} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">最近のアクティビティ</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
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
                        <span className="text-muted-foreground ml-2 text-xs">
                          by {activity.actorEmail}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
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
