#!/usr/bin/env node
/**
 * 規約と実装のズレを機械的に検出する。
 *
 * lint / typecheck / テストが見ないもの——AGENTS.md に文章で書いてあるだけの
 * 規約と、設計書と実装の同期——を対象にする。ここで挙がるものは全て、
 * 過去に実際にこのリポジトリで起きた種類の漏れ。
 *
 * 使い方: node scripts/audit.mjs [--json]
 * 終了コード: 0 = 問題なし / 1 = 検出あり
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const findings = [];

function report(check, file, message) {
  findings.push({ check, file, message });
}

function walk(dir, filter) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(ROOT, p);

// ---------------------------------------------------------------------------
// 1. データ取得を行うページに loading.tsx / error.tsx があるか
//
// `@/services/` を import しているかどうかで「データ取得を行う画面」を判定する。
// AGENTS.md の「プレースホルダーページには loading/error は不要」と噛み合う:
// 実データを取りに行っていないページは services を import しない。
// ---------------------------------------------------------------------------
const APP = join(ROOT, 'src/app');
const pages = walk(APP, (p) => p.endsWith('/page.tsx'));

/** 自身か祖先（src/app まで）に該当ファイルがあるか。error.tsx はグループ単位で効く。 */
function hasBoundary(dir, name) {
  let cur = dir;
  while (cur.startsWith(APP)) {
    if (existsSync(join(cur, name))) return true;
    if (cur === APP) break;
    cur = dirname(cur);
  }
  return false;
}

for (const page of pages) {
  if (!read(page).includes('@/services/')) continue;
  const dir = dirname(page);
  // loading.tsx は Suspense 境界なのでセグメント単位で置く（祖先では粒度が粗すぎる）
  if (!existsSync(join(dir, 'loading.tsx'))) {
    report('loading-error', rel(page), 'データ取得をしているが loading.tsx が無い');
  }
  if (!hasBoundary(dir, 'error.tsx')) {
    report('loading-error', rel(page), 'データ取得をしているが error.tsx が（祖先にも）無い');
  }
}

// ---------------------------------------------------------------------------
// 2/3. マイグレーション: RLS の有効化・ポリシー・org_id
//
// AGENTS.md「RLS未設定のテーブルをマージしてはならない」の機械化。
// テナントインフラ（organizations 等）は org_id を持たないので除外する。
// ---------------------------------------------------------------------------
const TENANT_INFRA = new Set(['organizations', 'memberships', 'invitations']);
const migrations = walk(join(ROOT, 'supabase/migrations'), (p) => p.endsWith('.sql'));
const sql = migrations.map(read).join('\n');

for (const m of sql.matchAll(
  /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g,
)) {
  const [, table, body] = m;
  if (!new RegExp(`alter table public\\.${table} enable row level security`).test(sql)) {
    report('rls', 'supabase/migrations', `${table}: RLS が有効化されていない`);
  }
  if (!new RegExp(`create policy "[^"]+" on public\\.${table}`).test(sql)) {
    report('rls', 'supabase/migrations', `${table}: RLS ポリシーが1つも無い`);
  }
  if (!TENANT_INFRA.has(table) && !/org_id uuid not null/.test(body)) {
    report('org-id', 'supabase/migrations', `${table}: org_id uuid not null を持たない`);
  }
}

// ---------------------------------------------------------------------------
// 4. Drizzle スキーマとマイグレーションの同期
// ---------------------------------------------------------------------------
const schemaSrc = walk(join(ROOT, 'src/db/schema'), (p) => p.endsWith('.ts'))
  .map(read)
  .join('\n');
const sqlTables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(/g)].map(
  (m) => m[1],
);
for (const table of sqlTables) {
  if (!new RegExp(`pgTable\\(\\s*['"]${table}['"]`).test(schemaSrc)) {
    report(
      'drizzle-sync',
      'src/db/schema',
      `${table}: マイグレーションにあるが Drizzle 定義が無い`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Server Action の Zod バリデーション
//
// AGENTS.md「新規 Server Action に Zod バリデーションが実装されているか」。
// 個々の関数までは追わず、ファイル単位で validations を参照しているかを見る。
// ---------------------------------------------------------------------------
for (const file of walk(APP, (p) => p.endsWith('/actions.ts'))) {
  if (!read(file).includes('@/lib/validations')) {
    report('action-validation', rel(file), '@/lib/validations を import していない');
  }
}

// ---------------------------------------------------------------------------
// 6. ドキュメント内の相対リンクが実在するか
//
// 「古い図は無いより悪い」の一種。リンク切れは読み手を存在しない前提へ導く。
// ---------------------------------------------------------------------------
const mdFiles = [
  ...walk(join(ROOT, 'docs'), (p) => p.endsWith('.md')),
  join(ROOT, 'README.md'),
  join(ROOT, 'AGENTS.md'),
].filter(existsSync);

for (const md of mdFiles) {
  for (const m of read(md).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = resolve(dirname(md), href.split('#')[0]);
    if (!existsSync(target)) {
      report('doc-link', rel(md), `リンク切れ: ${href}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. 画面一覧と実ルートの一致
//
// 実装した画面が screen-inventory.md に無いと、設計書が実態から遅れていく。
// ---------------------------------------------------------------------------
const inventoryPath = join(ROOT, 'docs/design/screen-inventory.md');
if (existsSync(inventoryPath)) {
  const inventory = read(inventoryPath);
  for (const page of pages) {
    const route =
      '/' +
      relative(APP, dirname(page))
        .split('/')
        .filter((seg) => seg && !seg.startsWith('('))
        .join('/');
    if (!inventory.includes(`\`${route}\``)) {
      report('screen-inventory', 'docs/design/screen-inventory.md', `${route} の記載が無い`);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Data API の GRANT が復活していないか
//
// 認可（ロール × リソース × 操作）は Service Layer にしか無い（ADR 0001）。
// anon / authenticated にテーブル権限を与えると、ユーザーが Service Layer を
// 通さずに直接テーブルを叩けるようになり、認可が丸ごと迂回される。
// 実際、この GRANT が付いていた間は viewer が自分のロールを owner に
// 書き換えられた（ADR 0011）。
//
// 過去のマイグレーションは書き換えられないので、個々の GRANT ではなく
// **適用後の最終状態**を見る。後続の REVOKE で打ち消されていれば問題ない。
//
// tests/rls/data-api-closed.test.ts が実 DB で同じことを検証しているが、
// あちらはローカル Supabase が要る。ここは静的に見るので CI の quality で止まる。
// ---------------------------------------------------------------------------

/** SQL からコメント・関数本体・文字列リテラルを落とす。散文中の grant を拾わないため。 */
function stripSqlNoise(text) {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'[^']*'/g, "''");
}

const EXPOSED_ROLES = ['anon', 'authenticated'];
// `${role} ${target}` → それを与えたマイグレーション。REVOKE で消える。
const dataApiGrants = new Map();

// function / schema / sequence への権限は対象外。テーブルとビューだけを見る。
const GRANT_RE =
  /^(grant|revoke) (?:.+?) on (?!(?:all )?(?:function|schema|sequence|routine)\b)(?:table )?(.+?) (?:to|from) (.+)$/i;

for (const migration of migrations) {
  for (const raw of stripSqlNoise(read(migration)).split(';')) {
    const statement = raw.replace(/\s+/g, ' ').trim();
    const m = GRANT_RE.exec(statement);
    if (!m) continue;

    const [, verb, target, roleList] = m;
    const roles = roleList.split(',').map((r) => r.trim().toLowerCase());

    for (const role of EXPOSED_ROLES) {
      if (!roles.includes(role)) continue;
      const key = `${role} ${target.trim().toLowerCase()}`;
      if (verb.toLowerCase() === 'grant') {
        dataApiGrants.set(key, { migration, statement });
      } else {
        dataApiGrants.delete(key);
      }
    }
  }
}

for (const [key, { migration, statement }] of dataApiGrants) {
  const [role, target] = key.split(' ');
  report(
    'data-api-grant',
    rel(migration),
    `${role} が ${target} に到達できる状態のまま: ${statement}`,
  );
}

// ---------------------------------------------------------------------------
// 9. Drizzle を直接触ってよいのは Service Layer だけか
//
// AGENTS.md「RSC / Server Action / Route Handler から直接 Drizzle を呼ばない」
// の機械化。ここを外れると authorize() も監査ログも通らない DB アクセス経路が
// できる。実際 AI チャットの Route Handler が `@/db` を直接叩いており、
// action-validation（actions.ts しか見ない）では捕まえられなかった。
// ---------------------------------------------------------------------------
const DB_IMPORT_RE = /from\s+['"]@\/db(?:\/[^'"]*)?['"]/;

for (const file of walk(join(ROOT, 'src'), (p) => p.endsWith('.ts') || p.endsWith('.tsx'))) {
  const path = rel(file);

  // Service Layer 本体と、スキーマ定義そのものは対象外。
  if (path.startsWith('src/services/') || path.startsWith('src/db/')) continue;
  if (!DB_IMPORT_RE.test(read(file))) continue;

  report('db-access', path, '@/db を直接 import している（Service Layer 経由にする）');
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else if (findings.length === 0) {
  console.log('✓ 監査: 検出なし');
} else {
  const byCheck = new Map();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }
  console.log(`✗ 監査: ${findings.length} 件\n`);
  for (const [check, items] of byCheck) {
    console.log(`[${check}]`);
    for (const i of items) console.log(`  ${i.file}: ${i.message}`);
    console.log('');
  }
}

process.exit(findings.length === 0 ? 0 : 1);
