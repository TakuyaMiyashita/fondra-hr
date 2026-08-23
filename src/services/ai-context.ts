import { count, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { departments } from '@/db/schema/departments';
import { employees } from '@/db/schema/employees';
import { evaluationCycles } from '@/db/schema/evaluation-cycles';
import { oneOnOnes } from '@/db/schema/one-on-ones';
import { organizations } from '@/db/schema/organizations';
import { skills } from '@/db/schema/skills';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type { OrgSummary } from '@/types/ai-context';

/** プロンプトに並べる部署の上限。組織が大きいときにプロンプトが膨らむのを防ぐ。 */
const DEPARTMENT_LIMIT = 20;

/**
 * AI アシスタントのシステムプロンプトに埋める組織サマリ。
 *
 * ここは Route Handler（`src/app/api/chat/`）から呼ばれる。以前は
 * Route Handler が Drizzle を直接叩いており、`authorize()` を通らない
 * DB アクセス経路になっていた。集計値だけとはいえ、認可を経ない経路を
 * 残すと「Service Layer が唯一の入口」という前提が崩れる。
 *
 * 返すのは**個人を特定しない集計値だけ**。個々の従業員名・評価・1on1 の
 * 内容は含めない。含めると、ロール別・本人限定の可視制御
 * （`src/services/field-visibility.ts` / `src/services/self.ts`）を
 * AI の回答経由で迂回できてしまう。
 */
export async function getOrgSummary(ctx: AuthContext): Promise<OrgSummary> {
  // AI アシスタントは全ロールが使える（サイドバーの minRole は viewer）。
  authorize(ctx, 'read', 'ai_assistant');

  const [org, employeeRow, departmentRow, skillRow, cycleRow, oneOnOneRow, departmentList] =
    await Promise.all([
      db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1),
      db.select({ count: count() }).from(employees).where(eq(employees.orgId, ctx.orgId)),
      db.select({ count: count() }).from(departments).where(eq(departments.orgId, ctx.orgId)),
      db.select({ count: count() }).from(skills).where(eq(skills.orgId, ctx.orgId)),
      db
        .select({ count: count() })
        .from(evaluationCycles)
        .where(eq(evaluationCycles.orgId, ctx.orgId)),
      db.select({ count: count() }).from(oneOnOnes).where(eq(oneOnOnes.orgId, ctx.orgId)),
      db
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
        .limit(DEPARTMENT_LIMIT),
    ]);

  return {
    orgName: org[0]?.name ?? '不明',
    employeeCount: employeeRow[0].count,
    departmentCount: departmentRow[0].count,
    skillCount: skillRow[0].count,
    cycleCount: cycleRow[0].count,
    oneOnOneCount: oneOnOneRow[0].count,
    departments: departmentList,
  };
}
