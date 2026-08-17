import { count, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { departments } from '@/db/schema/departments';
import { employees } from '@/db/schema/employees';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { oneOnOnes } from '@/db/schema/one-on-ones';
import { organizations } from '@/db/schema/organizations';
import { skills } from '@/db/schema/skills';
import type { AuthContext } from '@/services/auth-context';

export async function buildSystemPrompt(ctx: AuthContext): Promise<string> {
  const [orgRow] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);

  const [stats] = await db
    .select({
      employeeCount: count(employees.id),
    })
    .from(employees)
    .where(eq(employees.orgId, ctx.orgId));

  const [deptStats] = await db
    .select({
      departmentCount: count(departments.id),
    })
    .from(departments)
    .where(eq(departments.orgId, ctx.orgId));

  const [skillStats] = await db
    .select({
      skillCount: count(skills.id),
    })
    .from(skills)
    .where(eq(skills.orgId, ctx.orgId));

  const [cycleStats] = await db
    .select({
      cycleCount: count(evaluationCycles.id),
    })
    .from(evaluationCycles)
    .where(eq(evaluationCycles.orgId, ctx.orgId));

  const [oneOnOneStats] = await db
    .select({
      oneOnOneCount: count(oneOnOnes.id),
    })
    .from(oneOnOnes)
    .where(eq(oneOnOnes.orgId, ctx.orgId));

  const deptList = await db
    .select({
      name: departments.name,
      memberCount: sql<number>`(
        SELECT count(*) FROM employees
        WHERE employees.department_id = ${departments.id}
          AND employees.org_id = ${ctx.orgId}
      )`,
    })
    .from(departments)
    .where(eq(departments.orgId, ctx.orgId))
    .limit(20);

  const orgName = orgRow?.name ?? '不明';
  const deptSummary = deptList.length > 0
    ? deptList.map((d) => `  - ${d.name}（${d.memberCount}名）`).join('\n')
    : '  部署データなし';

  return `あなたは「${orgName}」のHRアシスタントです。
組織の人材データについて質問に答え、分析を提供します。
回答は日本語で、簡潔かつ具体的に行ってください。

## 組織の現在のデータ概要

- 従業員数: ${stats.employeeCount}名
- 部署数: ${deptStats.departmentCount}
- 登録スキル数: ${skillStats.skillCount}
- 評価サイクル数: ${cycleStats.cycleCount}
- 1on1記録数: ${oneOnOneStats.oneOnOneCount}件

## 部署構成
${deptSummary}

## 注意事項
- 個人情報は慎重に扱ってください
- データに基づいた回答を心がけ、推測の場合はその旨を明記してください
- 人事施策の提案は一般論として提示し、最終判断はユーザーに委ねてください`;
}
