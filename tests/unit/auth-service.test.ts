import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChainMock, createChainMock, createSequentialSelect } from '../helpers/db-mock';

/**
 * `src/services/auth.ts` は認証ブートストラップ層。
 *
 * AuthContext がまだ確定していない段階で呼ばれるため、他の Service Layer と違い
 * `authorize()` を通らない。その分「誰がどの組織に入れるか」を決める
 * SQL 条件そのものが唯一の防衛線になるので、条件の中身まで検証する。
 */
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

async function getDb() {
  const mod = await import('@/db');
  return mod.db as unknown as {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
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

/** drizzle の SQL 式を、演算子が読める程度のテキストに落とす。 */
function sqlText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.queryChunks)) return n.queryChunks.map(sqlText).join('');
  if (n.encoder) return '?';
  if (typeof n.name === 'string' && 'table' in n) return String(n.name);
  if (Array.isArray(n.value)) return (n.value as string[]).join('');
  return '';
}

let insertChain: ChainMock;
let updateChain: ChainMock;

beforeEach(async () => {
  vi.clearAllMocks();

  insertChain = createChainMock([{ id: 'org-new' }]);
  updateChain = createChainMock([]);

  const db = await getDb();
  db.select.mockImplementation(createSequentialSelect([[]]));
  db.insert.mockReturnValue(insertChain);
  db.update.mockReturnValue(updateChain);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createOrganizationWithOwner', () => {
  const FIXED_NOW = 1_700_000_000_000;
  const suffix = FIXED_NOW.toString(36);

  beforeEach(() => {
    // slug に Date.now() が混ざるため、固定しないと期待値が書けない。
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  it('組織を作成し、作成者を owner としてメンバーシップに登録する', async () => {
    const { createOrganizationWithOwner } = await import('@/services/auth');

    const result = await createOrganizationWithOwner('user-1', 'Acme Corp');

    expect(result).toEqual({ success: true, data: { orgId: 'org-new' } });

    const db = await getDb();
    expect(db.insert).toHaveBeenCalledTimes(2);

    // 組織の insert
    expect(insertChain.values.mock.calls[0][0]).toEqual({
      name: 'Acme Corp',
      slug: `acme-corp-${suffix}`,
    });
    // サインアップした本人が owner になること。ここが member 等になると
    // 自分で作った組織の設定を触れなくなる。
    expect(insertChain.values.mock.calls[1][0]).toEqual({
      userId: 'user-1',
      orgId: 'org-new',
      role: 'owner',
    });
  });

  it('記号・空白を含む組織名を slug 安全な形に正規化する', async () => {
    const { createOrganizationWithOwner } = await import('@/services/auth');

    await createOrganizationWithOwner('user-1', '  Foo & Bar, Inc.  ');

    // 連続する非英数字は 1 つの "-" に畳まれ、先頭末尾の "-" は落ちる。
    expect(insertChain.values.mock.calls[0][0]).toEqual({
      name: '  Foo & Bar, Inc.  ',
      slug: `foo-bar-inc-${suffix}`,
    });
  });

  it('日本語の組織名は文字を保持したまま slug 化する', async () => {
    const { createOrganizationWithOwner } = await import('@/services/auth');

    await createOrganizationWithOwner('user-1', '株式会社テスト');

    const values = insertChain.values.mock.calls[0][0] as { slug: string };
    expect(values.slug).toBe(`株式会社テスト-${suffix}`);
  });

  it('slug 化して空になる組織名でもフォールバック slug を生成する', async () => {
    // "!!!" のように英数字も日本語も含まない名前は slug が空文字になる。
    // フォールバックが無いと slug が "-<ts>" になり、NOT NULL/UNIQUE 制約と衝突しうる。
    const { createOrganizationWithOwner } = await import('@/services/auth');

    await createOrganizationWithOwner('user-1', '!!!');

    const values = insertChain.values.mock.calls[0][0] as { slug: string };
    expect(values.slug).toBe(`org-${suffix}-${suffix}`);
  });

  it('DB エラー時は例外を投げず、メッセージ付きの失敗 Result を返す', async () => {
    // サインアップ直後に呼ばれるため、例外が漏れると新規登録画面が 500 になる。
    const { createOrganizationWithOwner } = await import('@/services/auth');

    const db = await getDb();
    db.insert.mockImplementation(() => {
      throw new Error('duplicate key value violates unique constraint');
    });

    const result = await createOrganizationWithOwner('user-1', 'Acme');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('組織の作成に失敗しました');
      expect(result.error).toContain('duplicate key');
    }
  });

  it('Error 以外が throw された場合は Unknown error として扱う', async () => {
    const { createOrganizationWithOwner } = await import('@/services/auth');

    const db = await getDb();
    db.insert.mockImplementation(() => {
      throw 'connection reset';
    });

    const result = await createOrganizationWithOwner('user-1', 'Acme');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('組織の作成に失敗しました: Unknown error');
    }
  });

  it('メンバーシップ登録に失敗した場合も失敗 Result を返す', async () => {
    const { createOrganizationWithOwner } = await import('@/services/auth');

    insertChain.values
      .mockImplementationOnce(() => insertChain)
      .mockImplementationOnce(() => {
        throw new Error('membership insert failed');
      });

    const result = await createOrganizationWithOwner('user-1', 'Acme');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('membership insert failed');
    }
  });
});

describe('getUserMemberships', () => {
  it('自分の userId に紐づく所属組織のみを返す', async () => {
    const { getUserMemberships } = await import('@/services/auth');

    const rows = [
      { orgId: 'org-1', role: 'owner', orgName: 'Acme', orgSlug: 'acme', orgPlan: 'free' },
    ];
    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([rows]));

    const result = await getUserMemberships('user-1');

    expect(result).toEqual(rows);

    // 他人の所属が混ざらないよう、user_id で必ず絞られていること。
    const chain = db.select.mock.results[0].value as ChainMock;
    const params = collectParams(chain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'user_id', value: 'user-1' });
  });

  it('どの組織にも所属していないユーザーには空配列を返す', async () => {
    // 組織未作成の新規ユーザーが必ず通る経路。ここで例外になるとオンボーディングが止まる。
    const { getUserMemberships } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getUserMemberships('user-new')).resolves.toEqual([]);
  });
});

describe('switchOrganization', () => {
  it('所属している組織には切り替えられ、orgId と role を返す', async () => {
    const { switchOrganization } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(
      createSequentialSelect([[{ orgId: 'org-2', role: 'admin', userId: 'user-1' }]]),
    );

    const result = await switchOrganization('user-1', 'org-2');

    expect(result).toEqual({ success: true, data: { orgId: 'org-2', role: 'admin' } });
  });

  it('所属していない組織への切り替えを拒否する', async () => {
    // 組織スイッチャーは任意の orgId を送れる。ここが素通りすると
    // 他テナントの AuthContext を発行できてしまう最悪の穴になる。
    const { switchOrganization } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    const result = await switchOrganization('user-1', 'org-not-mine');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('この組織へのアクセス権がありません');
    }
  });

  it('userId と targetOrgId の両方で membership を検索する', async () => {
    const { switchOrganization } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await switchOrganization('user-1', 'org-2');

    const chain = db.select.mock.results[0].value as ChainMock;
    const params = collectParams(chain.where.mock.calls[0][0]);
    expect(params).toContainEqual({ column: 'user_id', value: 'user-1' });
    expect(params).toContainEqual({ column: 'org_id', value: 'org-2' });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });
});

describe('getInvitationByToken', () => {
  it('有効な招待を組織名付きで返す', async () => {
    const { getInvitationByToken } = await import('@/services/auth');

    const invitation = {
      id: 'inv-1',
      orgId: 'org-1',
      email: 'new@example.com',
      role: 'member',
      expiresAt: new Date('2026-12-31'),
      acceptedAt: null,
      orgName: 'Acme',
    };
    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[invitation]]));

    await expect(getInvitationByToken('tok-1')).resolves.toEqual(invitation);
  });

  it('該当する招待が無い場合は undefined ではなく null を返す', async () => {
    // 呼び出し側は `if (!invitation)` で分岐する。undefined が漏れると
    // JSON シリアライズ時に挙動が変わるため null 固定であることを保証する。
    const { getInvitationByToken } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await expect(getInvitationByToken('unknown-token')).resolves.toBeNull();
  });

  it('token 一致に加えて「未承認」「未期限切れ」を SQL 条件で絞る', async () => {
    // 使い回し・期限切れの招待リンクで組織に入れてしまうのを防ぐ条件。
    const { getInvitationByToken } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[]]));

    await getInvitationByToken('tok-1');

    const chain = db.select.mock.results[0].value as ChainMock;
    const where = chain.where.mock.calls[0][0];
    expect(collectParams(where)).toContainEqual({ column: 'token', value: 'tok-1' });

    const text = sqlText(where);
    expect(text).toContain('accepted_at is null');
    expect(text).toContain('expires_at > ');
  });
});

describe('acceptInvitation', () => {
  it('メンバーシップを作成し、招待を承認済みにする', async () => {
    const { acceptInvitation } = await import('@/services/auth');

    const result = await acceptInvitation('inv-1', 'user-1', 'org-1', 'member', 'taro@example.com');

    expect(result).toEqual({ success: true, data: undefined });

    // 招待に書かれたロールがそのまま付与されること（昇格させない）。
    expect(insertChain.values).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'member',
    });

    // 招待を承認済みにしないと同じリンクを何度でも使えてしまう。
    const setArg = updateChain.set.mock.calls[0][0] as { acceptedAt: Date };
    expect(setArg.acceptedAt).toBeInstanceOf(Date);
    expect(collectParams(updateChain.where.mock.calls[0][0])).toContainEqual({
      column: 'id',
      value: 'inv-1',
    });
  });

  /**
   * 実務では「入社手続きで従業員レコードを登録 → 後からアカウントを発行」
   * の順になるため、従業員側からの紐付け（createEmployee）だけでは漏れる。
   * 招待受諾のタイミングでも、同じ組織・同じメールの従業員に紐付ける。
   *
   * これが無いと employees.user_id が null のままになり、
   * 本人限定の操作（自分が当事者の 1on1 のみ編集する等）が一切通らなくなる。
   */
  it('同じ組織・同じメールの従業員レコードに user_id を紐付ける', async () => {
    const { acceptInvitation } = await import('@/services/auth');

    await acceptInvitation('inv-1', 'user-1', 'org-1', 'member', 'Taro@Example.com');

    // 1回目は invitations の更新、2回目が employees の紐付け
    const setArg = updateChain.set.mock.calls[1][0] as { userId: string };
    expect(setArg.userId).toBe('user-1');

    const text = sqlText(updateChain.where.mock.calls[1][0]);
    // 大文字小文字を無視して突き合わせる（マスタ側は手入力で表記が揺れる）
    expect(text).toContain('lower(');
    // 他テナントの従業員を巻き込まないこと
    expect(collectParams(updateChain.where.mock.calls[1][0])).toContainEqual({
      column: 'org_id',
      value: 'org-1',
    });
    // 既に紐付け済みのレコードは奪わないこと
    expect(text).toContain('user_id is null');
  });

  it('メンバーシップ作成が失敗した場合は失敗 Result を返す', async () => {
    // 同一ユーザー・同一組織の unique 制約違反（二重承認）で到達する経路。
    const { acceptInvitation } = await import('@/services/auth');

    const db = await getDb();
    db.insert.mockImplementation(() => {
      throw new Error('duplicate membership');
    });

    const result = await acceptInvitation('inv-1', 'user-1', 'org-1', 'member', 'taro@example.com');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('招待の承認に失敗しました');
      expect(result.error).toContain('duplicate membership');
    }
    // 失敗時に招待を承認済みにしてしまわないこと。
    expect(db.update).not.toHaveBeenCalled();
  });

  it('Error 以外が throw された場合は Unknown error として扱う', async () => {
    const { acceptInvitation } = await import('@/services/auth');

    const db = await getDb();
    db.insert.mockImplementation(() => {
      throw { code: '23505' };
    });

    const result = await acceptInvitation('inv-1', 'user-1', 'org-1', 'viewer', 'taro@example.com');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('招待の承認に失敗しました: Unknown error');
    }
  });
});

/**
 * メール確認後に、保留していた組織作成 / 招待受諾を消化する。
 *
 * 確認前に作ると、確認されなかった登録のぶんだけ「誰も入れない組織」が残り、
 * 招待経路では accepted_at だけが立って招待が消費される。この関数はその
 * 遅延実行の受け皿であり、メール確認を有効化できるかどうかがここに懸かる。
 *
 * 預け先の user_metadata は**クライアントから書き換えられる**領域なので、
 * ここでの再検証（招待の引き直し・メール一致・所属の有無）が防衛線になる。
 */
describe('completePendingSignUp', () => {
  const invitation = {
    id: 'inv-1',
    orgId: 'org-1',
    email: 'invitee@example.com',
    role: 'member' as const,
    expiresAt: new Date(Date.now() + 86400000),
    acceptedAt: null,
    orgName: 'Acme',
  };

  it('保留が無ければ DB に触れない', async () => {
    // パスワード再設定など、確認以外の用途で同じコールバックを通る。
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    const result = await completePendingSignUp('user-1', 'user@example.com', {});

    expect(result).toEqual({ success: true, data: { created: false } });
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [{ pending_org_name: 123 }], [{ pending_org_name: '' }]])(
    'metadata が %s なら保留無しとして扱う',
    async (metadata) => {
      const { completePendingSignUp } = await import('@/services/auth');

      const db = await getDb();
      const result = await completePendingSignUp('user-1', 'user@example.com', metadata);

      expect(result).toEqual({ success: true, data: { created: false } });
      expect(db.select).not.toHaveBeenCalled();
    },
  );

  it('既に所属していれば作り直さない', async () => {
    // 消化済みの metadata が残ったまま再度コールバックを通っても、
    // 組織が増殖しないこと。
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[{ orgId: 'org-1', role: 'owner' }]]));

    const result = await completePendingSignUp('user-1', 'user@example.com', {
      pending_org_name: 'Acme',
    });

    expect(result).toEqual({ success: true, data: { created: false } });
    expect(insertChain.values).not.toHaveBeenCalled();
  });

  it('未所属なら預けた組織名で組織を作る', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const result = await completePendingSignUp('user-1', 'user@example.com', {
      pending_org_name: 'Acme',
    });

    expect(result).toEqual({ success: true, data: { created: true } });
    // 組織のオーナーは確認を終えた本人。
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', role: 'owner' }),
    );
  });

  it('組織作成に失敗したら失敗 Result を返す', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.insert.mockImplementation(() => {
      throw new Error('duplicate key');
    });

    const result = await completePendingSignUp('user-1', 'user@example.com', {
      pending_org_name: 'Acme',
    });

    expect(result).toEqual({
      success: false,
      error: '組織の作成に失敗しました: duplicate key',
    });
  });

  it('預けたトークンで招待を引き直して受諾する', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    // 0: 所属の確認 / 1: 招待の引き直し
    db.select.mockImplementation(createSequentialSelect([[], [invitation]]));

    const result = await completePendingSignUp('user-1', 'invitee@example.com', {
      pending_invitation_token: 'tok-1',
    });

    expect(result).toEqual({ success: true, data: { created: true } });
    // 招待に書かれたロールがそのまま付与されること（昇格させない）。
    expect(insertChain.values).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'member',
    });
  });

  it('招待が無効・期限切れなら受諾しない', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], []]));

    const result = await completePendingSignUp('user-1', 'invitee@example.com', {
      pending_invitation_token: 'tok-1',
    });

    expect(result).toEqual({ success: false, error: 'この招待リンクは無効か、期限切れです' });
    expect(insertChain.values).not.toHaveBeenCalled();
  });

  /**
   * user_metadata はクライアントから書き換えられるため、トークンだけを
   * 信用の起点にすると、トークンを入手した第三者が別アドレスのアカウントで
   * 組織に参加できてしまう。確認済みメールとの一致を必ず要求する。
   */
  it('確認済みメールが招待先と違えば受諾しない', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [invitation]]));

    const result = await completePendingSignUp('user-1', 'attacker@example.com', {
      pending_invitation_token: 'tok-1',
    });

    expect(result).toEqual({ success: false, error: '招待されたメールアドレスと一致しません' });
    expect(insertChain.values).not.toHaveBeenCalled();
  });

  it('メールが取れない場合も受諾しない', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [invitation]]));

    const result = await completePendingSignUp('user-1', null, {
      pending_invitation_token: 'tok-1',
    });

    expect(result.success).toBe(false);
    expect(insertChain.values).not.toHaveBeenCalled();
  });

  it('メールの大文字小文字は無視して一致とみなす', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [invitation]]));

    const result = await completePendingSignUp('user-1', 'Invitee@Example.COM', {
      pending_invitation_token: 'tok-1',
    });

    expect(result).toEqual({ success: true, data: { created: true } });
  });

  it('受諾に失敗したら失敗 Result を返す', async () => {
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [invitation]]));
    db.insert.mockImplementation(() => {
      throw new Error('duplicate membership');
    });

    const result = await completePendingSignUp('user-1', 'invitee@example.com', {
      pending_invitation_token: 'tok-1',
    });

    expect(result).toEqual({
      success: false,
      error: '招待の承認に失敗しました: duplicate membership',
    });
  });

  it('両方預かっていたら招待を優先する', async () => {
    // 招待経路は他人の組織への参加であり権限が伴う。組織の新規作成と
    // 取り違えると、招待が未消化のまま別組織ができてしまう。
    const { completePendingSignUp } = await import('@/services/auth');

    const db = await getDb();
    db.select.mockImplementation(createSequentialSelect([[], [invitation]]));

    await completePendingSignUp('user-1', 'invitee@example.com', {
      pending_invitation_token: 'tok-1',
      pending_org_name: 'Acme',
    });

    expect(insertChain.values).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'member',
    });
    expect(insertChain.values).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme' }));
  });
});
