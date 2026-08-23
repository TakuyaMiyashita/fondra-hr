/**
 * RLS ポリシーを `authenticated` として検証するためのクライアント。
 *
 * 20260822000001 で Data API の GRANT を剥がしたため、PostgREST 経由では
 * `authenticated` はテーブルに到達できなくなった（それが狙い）。
 * ただし RLS ポリシー自体は残してあり、「将来 GRANT を戻したときに
 * テナントを跨がないこと」は引き続き保証したい。
 *
 * そこでトランザクションの中でだけ GRANT を与えてロールを切り替え、
 * 検証が終わったら ROLLBACK する。GRANT は Postgres ではトランザクショナルなので、
 * 権限はテスト後に残らない。
 *
 * 「GRANT があったとしても RLS がテナントを跨がせない」ことを確かめる形になり、
 * 二重防御のうち RLS 側の担保がテストとして残る。
 *
 * Data API が実際に閉じていること自体は data-api-closed.test.ts が検証する。
 */
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const sql = postgres(DB_URL, { prepare: false, onnotice: () => {} });

export async function closeRlsClient() {
  await sql.end();
}

export interface RlsResult<T = OrgScoped> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * 行の既定型。RLS の検証対象はすべて org_id を持つテナントスコープの
 * テーブル・ビューなので、org_id を必須にしておくと
 * `every((r) => r.org_id === orgId)` 形式の検証がそのまま書ける。
 */
export interface OrgScoped {
  org_id: string;
  [column: string]: unknown;
}

type Row = Record<string, unknown>;

/**
 * supabase-js の `.from(t).select().eq(c, v)` と同じ形で書けるビルダ。
 * 既存のテスト本文をそのまま使えるように合わせてある。
 */
class RlsQuery<T = OrgScoped> implements PromiseLike<RlsResult<T>> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private filters: [string, unknown][] = [];

  constructor(
    private readonly claims: Claims,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  insert(values: Row | Row[]): this {
    this.op = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Row): this {
    this.op = 'update';
    this.payload = [values];
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  then<R1 = RlsResult<T>, R2 = never>(
    onfulfilled?: ((value: RlsResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  /** 組み立てた SQL と束縛値。`$n` は 1 始まり。 */
  private build(): [string, unknown[]] {
    const params: unknown[] = [];
    const where = () => {
      if (this.filters.length === 0) return '';
      const clauses = this.filters.map(([column, value]) => {
        params.push(value);
        return `${column} = $${params.length}`;
      });
      return ` where ${clauses.join(' and ')}`;
    };

    if (this.op === 'insert') {
      const columns = Object.keys(this.payload[0]);
      const tuples = this.payload.map(
        (row) =>
          `(${columns
            .map((c) => {
              params.push(row[c]);
              return `$${params.length}`;
            })
            .join(', ')})`,
      );
      return [
        `insert into ${this.table} (${columns.join(', ')}) values ${tuples.join(', ')} returning *`,
        params,
      ];
    }

    if (this.op === 'update') {
      const assignments = Object.entries(this.payload[0]).map(([column, value]) => {
        params.push(value);
        return `${column} = $${params.length}`;
      });
      return [`update ${this.table} set ${assignments.join(', ')}${where()} returning *`, params];
    }

    if (this.op === 'delete') {
      return [`delete from ${this.table}${where()} returning *`, params];
    }

    return [`select * from ${this.table}${where()}`, params];
  }

  private async run(): Promise<RlsResult<T>> {
    const [query, params] = this.build();
    const reserved = await sql.reserve();

    try {
      await reserved.unsafe('begin');

      // Data API を閉じたあとも RLS を検証できるように、このトランザクションの
      // 中でだけ権限を与える。ROLLBACK で元に戻る。
      for (const [target, privileges] of grantsFor(this.table)) {
        await reserved.unsafe(`grant ${privileges} on ${target} to authenticated`);
      }

      await reserved.unsafe(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({
          sub: this.claims.sub,
          role: 'authenticated',
          app_metadata: { org_id: this.claims.orgId, role: this.claims.role ?? 'owner' },
        }),
      ]);
      await reserved.unsafe('set local role authenticated');

      const rows = await reserved.unsafe(query, params as never[]);
      return { data: [...rows] as T[], error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    } finally {
      await reserved.unsafe('rollback');
      reserved.release();
    }
  }
}

/**
 * 検証対象に必要な GRANT。
 *
 * employee_risk_scores は security_invoker のビューなので、
 * ビュー自体だけでなく参照元テーブルの SELECT も要る。
 * ここが足りないと RLS ではなく権限不足で落ち、
 * 「ポリシーが効いた」のか「権限が無い」のか区別が付かなくなる。
 */
function grantsFor(table: string): [string, string][] {
  if (table !== 'employee_risk_scores') {
    return [[table, 'all']];
  }

  return [
    ['employee_risk_scores', 'select'],
    ['employees', 'select'],
    ['one_on_ones', 'select'],
    ['employee_skills', 'select'],
  ];
}

export interface Claims {
  sub: string;
  orgId: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
}

export function rlsClient(claims: Claims) {
  return {
    from<T = OrgScoped>(table: string) {
      return new RlsQuery<T>(claims, table);
    },
  };
}
