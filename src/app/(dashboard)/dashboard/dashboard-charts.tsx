'use client';

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

import type {
  DepartmentHeadcount,
  EmployeeStatusCount,
  SkillCategoryCount,
} from '@/types/dashboard';

/**
 * Recharts を使うのはこのファイルだけ。
 *
 * **`dashboard-client.tsx` から `next/dynamic` で読む。** Recharts は
 * `/dashboard` のルート固有 JS の大半を占めており、統計カードと
 * アクティビティ一覧は Recharts が届く前から描ける。同じ塊にしておくと、
 * グラフ以外まで Recharts のダウンロードを待つことになる。
 *
 * **空状態の分岐は呼び出し側に置いてある。** ここに置くと、データが0件の
 * 組織でも「データがありません」を出すためだけに Recharts を取りに行く。
 */

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

const STATUS_LABELS: Record<string, string> = {
  active: '在籍',
  inactive: '休職',
  retired: '退職',
};

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
};

export function DepartmentChart({ data }: { data: DepartmentHeadcount[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value}人`, '人数']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SkillCategoryChart({ data }: { data: SkillCategoryCount[] }) {
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
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [`${value}件`, 'スキル割当数']}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function EmployeeStatusChart({ data }: { data: EmployeeStatusCount[] }) {
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
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value}人`, '人数']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
