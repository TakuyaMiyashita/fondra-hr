import type { AuthContext } from '@/services/auth-context';
import { getOrgSummary } from '@/services/ai-context';

/**
 * AI アシスタントのシステムプロンプトを組み立てる。
 *
 * データ取得は Service Layer（`getOrgSummary`）に任せ、ここは整形だけを行う。
 * Route Handler から Drizzle を直接叩かないため（AGENTS.md）。
 */
export async function buildSystemPrompt(ctx: AuthContext): Promise<string> {
  const summary = await getOrgSummary(ctx);

  const deptSummary =
    summary.departments.length > 0
      ? summary.departments.map((d) => `  - ${d.name}（${d.memberCount}名）`).join('\n')
      : '  部署データなし';

  return `あなたは「${summary.orgName}」のHRアシスタントです。
組織の人材データについて質問に答え、分析を提供します。
回答は日本語で、簡潔かつ具体的に行ってください。

## 組織の現在のデータ概要

- 従業員数: ${summary.employeeCount}名
- 部署数: ${summary.departmentCount}
- 登録スキル数: ${summary.skillCount}
- 評価サイクル数: ${summary.cycleCount}
- 1on1記録数: ${summary.oneOnOneCount}件

## 部署構成
${deptSummary}

## 注意事項
- 個人情報は慎重に扱ってください
- データに基づいた回答を心がけ、推測の場合はその旨を明記してください
- 人事施策の提案は一般論として提示し、最終判断はユーザーに委ねてください`;
}
