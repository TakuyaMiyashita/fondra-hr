import { and, asc, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema/audit-logs';
import { authUsers } from '@/db/schema/memberships';
import type { AuditLogListQuery } from '@/lib/validations/audit-log';
import type { AuthContext } from '@/services/auth-context';
import { authorize } from '@/services/authorize';
import type { AuditLog, AuditLogListResult } from '@/types/audit-log';

/**
 * 監査ログに値を残さないフィールド。
 *
 * 監査ログは全ロールが読める（docs/database/authorization-matrix.md）。
 * 一方これらは行単位・フィールド単位の可視制御で特定の相手にしか
 * 見せていない値であり（src/services/field-visibility.ts、
 * src/services/self.ts）、変更内容として素通しで書くと
 * viewer が監査ログ画面を開くだけで全部読めてしまう。
 *
 * 監査ログに要るのは「誰がいつ何を変えたか」であって、変更後の値ではない。
 * フィールド名と変更があった事実だけを残し、値は伏せる。
 *
 * 氏名・カナ・メール・社員番号も伏せる（security-audit-report.md F-02）。
 * 監査ログは追記専用で後から消せない（`prevent_audit_log_modification`）。
 * ここに個人情報を書くと、匿名化（ADR 0016）で従業員マスタから消しても
 * 監査ログ画面には残り続け、全ロールが読める。書く時点で落とすしかない。
 * `email` は招待の監査ログ（`invitation.create` / `invitation.delete`）でも
 * 同じキーを使っており、そちらも伏せる（招待先のメールも個人情報）。
 */
const REDACTED_FIELDS = new Set([
  'birthDate',
  'notes',
  'comment',
  'aiSummary',
  'ratings',
  'fullName',
  'fullNameKana',
  'email',
  'employeeCode',
]);

/** 伏せた値の表示。UI はこの文字列をそのまま描画する。 */
export const REDACTED = '（記録しない）';

/**
 * 機微フィールドの値を伏せる。`{ from, to }` 形式と素の値の両方を受ける。
 *
 * キーの集合は変えないので、変更されたフィールド名と項目数は監査ログに残る。
 */
function redact(changes: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    if (!REDACTED_FIELDS.has(key)) {
      result[key] = value;
      continue;
    }

    const isChangePair =
      typeof value === 'object' && value !== null && 'from' in value && 'to' in value;

    result[key] = isChangePair ? { from: REDACTED, to: REDACTED } : REDACTED;
  }

  return result;
}

/**
 * 監査ログを書き込む先。`db` そのものか、`db.transaction()` のコールバックが
 * 受け取るトランザクション。本体の変更と同じトランザクションで書くと、
 * 監査ログの INSERT が落ちたときに変更ごと巻き戻る（記録の欠落を防ぐ）。
 */
export type AuditLogExecutor = Pick<typeof db, 'insert'>;

/** 監査ログの「誰が・どの組織で」。AuthContext が無い経路で明示する。 */
export type AuditActor = { orgId: string; userId: string };

/**
 * actor と組織を明示して監査ログを書く。
 *
 * 認証ブートストラップ（組織作成・招待受諾）は AuthContext が確定する前に
 * 走るため `writeAuditLog(ctx, ...)` を使えない。その経路のための版。
 * 認可は呼び出し側の責任（ここは書き込みしかしない）。
 */
export async function writeAuditLogAs(
  actor: AuditActor,
  action: string,
  resourceType: string,
  resourceId: string | null,
  changes?: Record<string, unknown>,
  executor: AuditLogExecutor = db,
) {
  await executor.insert(auditLogs).values({
    orgId: actor.orgId,
    actorUserId: actor.userId,
    action,
    resourceType,
    resourceId,
    changes: changes ? redact(changes) : null,
  });
}

export async function writeAuditLog(
  ctx: AuthContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  changes?: Record<string, unknown>,
  executor: AuditLogExecutor = db,
) {
  await writeAuditLogAs(
    { orgId: ctx.orgId, userId: ctx.userId },
    action,
    resourceType,
    resourceId,
    changes,
    executor,
  );
}

export async function listAuditLogs(
  ctx: AuthContext,
  query: AuditLogListQuery,
): Promise<AuditLogListResult> {
  authorize(ctx, 'read', 'audit_log');

  const conditions = [eq(auditLogs.orgId, ctx.orgId)];

  if (query.resourceType) {
    conditions.push(eq(auditLogs.resourceType, query.resourceType));
  }

  if (query.action) {
    conditions.push(eq(auditLogs.action, query.action));
  }

  const where = and(...conditions);

  const [totalRow] = await db.select({ count: count() }).from(auditLogs).where(where);

  const offset = (query.page - 1) * query.perPage;
  const orderFn = query.order === 'asc' ? asc : desc;

  const rows = await db
    .select({
      id: auditLogs.id,
      actorEmail: authUsers.email,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      changes: auditLogs.changes,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(authUsers, eq(auditLogs.actorUserId, authUsers.id))
    .where(where)
    // createdAt は一意ではない（同一トランザクションの一括操作で同値になる）。
    // タイブレーカーが無いとページ間で行の重複・欠落が起きるため id を併用する。
    .orderBy(orderFn(auditLogs.createdAt), asc(auditLogs.id))
    .limit(query.perPage)
    .offset(offset);

  return {
    logs: rows as AuditLog[],
    total: totalRow.count,
  };
}

export async function getResourceTypes(ctx: AuthContext): Promise<string[]> {
  authorize(ctx, 'read', 'audit_log');

  const rows = await db
    .selectDistinct({ resourceType: auditLogs.resourceType })
    .from(auditLogs)
    .where(eq(auditLogs.orgId, ctx.orgId))
    .orderBy(asc(auditLogs.resourceType));

  return rows.map((r) => r.resourceType);
}
