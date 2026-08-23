import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/services/auth-context';

import { ALL_ROLES, CTX_BY_ROLE, ctxOtherOrg } from '../helpers/auth-fixtures';
import { type ChainMock, createChainMock, createSequentialSelect } from '../helpers/db-mock';

const adminCtx: AuthContext = { userId: 'user-1', orgId: 'org-1', role: 'admin' };

let selectChain: ChainMock;

vi.mock('@/db', () => ({ db: { select: vi.fn() } }));

async function getDb() {
  const mod = await import('@/db');
  return mod.db as unknown as { select: ReturnType<typeof vi.fn> };
}

/** drizzle の SQL 式から「カラム名 = 束縛値」の組を再帰的に取り出す。 */
function collectParams(
  node: unknown,
  acc: { column: string; value: unknown }[] = [],
): { column: string; value: unknown }[] {
  if (!node || typeof node !== 'object') return acc;
  const n = node as Record<string, unknown>;
  const encoder = n.encoder as Record<string, unknown> | undefined;
  if (encoder && typeof encoder.name === 'string') {
    acc.push({ column: encoder.name, value: n.value });
  }
  if (Array.isArray(n.queryChunks)) {
    for (const chunk of n.queryChunks) collectParams(chunk, acc);
  }
  return acc;
}

/**
 * getOrgSummary が投げるクエリの並び。
 * 0: 組織名 / 1: 従業員数 / 2: 部署数 / 3: スキル数 / 4: 評価サイクル数 /
 * 5: 1on1数 / 6: 部署一覧
 */
function summarySequence(org: unknown[] = [{ name: 'テスト組織' }], departments: unknown[] = []) {
  return createSequentialSelect([
    org,
    [{ count: 11 }],
    [{ count: 4 }],
    [{ count: 25 }],
    [{ count: 3 }],
    [{ count: 42 }],
    departments,
  ]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  selectChain = createChainMock([]);
  const db = await getDb();
  db.select.mockReturnValue(selectChain);
});

describe('getOrgSummary', () => {
  it('組織名と各種件数を集計して返す', async () => {
    const { getOrgSummary } = await import('@/services/ai-context');

    const db = await getDb();
    db.select.mockImplementation(
      summarySequence(
        [{ name: 'テスト組織' }],
        [
          { name: '開発部', memberCount: 7 },
          { name: '営業部', memberCount: 4 },
        ],
      ),
    );

    await expect(getOrgSummary(adminCtx)).resolves.toEqual({
      orgName: 'テスト組織',
      employeeCount: 11,
      departmentCount: 4,
      skillCount: 25,
      cycleCount: 3,
      oneOnOneCount: 42,
      departments: [
        { name: '開発部', memberCount: 7 },
        { name: '営業部', memberCount: 4 },
      ],
    });
  });

  it('組織が見つからないときは組織名を「不明」にする', async () => {
    // 組織が消えた直後などに落ちると、AI アシスタント全体が 500 になる。
    const { getOrgSummary } = await import('@/services/ai-context');

    const db = await getDb();
    db.select.mockImplementation(summarySequence([]));

    await expect(getOrgSummary(adminCtx)).resolves.toMatchObject({ orgName: '不明' });
  });

  it('部署が無い組織では空配列を返す', async () => {
    const { getOrgSummary } = await import('@/services/ai-context');

    const db = await getDb();
    db.select.mockImplementation(summarySequence());

    await expect(getOrgSummary(adminCtx)).resolves.toMatchObject({ departments: [] });
  });

  it.each(ALL_ROLES)('%s は組織サマリを読める', async (role) => {
    // AI アシスタントはサイドバーで viewer にも出している。
    // ここを絞ると画面はあるのに常にエラーになる。
    const { getOrgSummary } = await import('@/services/ai-context');

    const db = await getDb();
    db.select.mockImplementation(summarySequence());

    await expect(getOrgSummary(CTX_BY_ROLE[role])).resolves.toMatchObject({
      orgName: 'テスト組織',
    });
  });

  it('全てのクエリを自組織の org_id で絞る', async () => {
    // 1本でも org_id が抜けると、AI の回答経由で他テナントの規模が漏れる。
    const { getOrgSummary } = await import('@/services/ai-context');

    const db = await getDb();
    db.select.mockImplementation(summarySequence());

    await getOrgSummary(ctxOtherOrg);

    const wheres = db.select.mock.results.map((r) => (r.value as ChainMock).where.mock.calls[0][0]);

    expect(wheres).toHaveLength(7);
    for (const where of wheres) {
      const values = collectParams(where).map((p) => p.value);
      expect(values).toContain(ctxOtherOrg.orgId);
      expect(values).not.toContain('org-1');
    }
  });

  it('部署一覧には上限を掛ける', async () => {
    // 部署が多い組織でプロンプトが膨らむのを防ぐ。
    const { getOrgSummary } = await import('@/services/ai-context');

    const db = await getDb();
    db.select.mockImplementation(summarySequence());

    await getOrgSummary(adminCtx);

    const departmentList = db.select.mock.results[6].value as ChainMock;
    expect(departmentList.limit).toHaveBeenCalledWith(20);
  });
});
