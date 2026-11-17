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
// 5b. Route Handler の Zod バリデーション
//
// **Server Action と同じく入力境界である。** actions.ts しか見ていなかったため、
// /api/chat がリクエスト body を無検証の `as` で受けており、messages が
// 無いだけで TypeError → 500 になっていた（スタックごと返る）。
//
// body を読む route.ts だけを対象にする。GET しか持たない route.ts
// （/api/health）は読む body が無いので、検証を求めても意味が無い。
// ---------------------------------------------------------------------------
for (const file of walk(APP, (p) => p.endsWith('/route.ts'))) {
  const src = read(file);
  const readsBody = /\breq(uest)?\.(json|formData|text)\s*\(/.test(src);
  if (readsBody && !src.includes('@/lib/validations')) {
    report(
      'route-validation',
      rel(file),
      'body を読んでいるが @/lib/validations を import していない',
    );
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

/** JS/TS からブロックコメントと行コメントを落とす。説明文中の語を拾わないため。 */
function stripJsComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ---------------------------------------------------------------------------
// 10. セキュリティヘッダーと X-Powered-By の抑止
//
// 監査 F-15 系。next.config.ts の headers() で付けているセキュリティヘッダーと
// `poweredByHeader: false` は、設定を整理したときに黙って消えても
// lint / typecheck / ビルドのどれも落ちない。消えるとクリックジャッキング対策
// （X-Frame-Options）や MIME スニッフィング対策（X-Content-Type-Options）が
// 無言で外れるので、ここで存在を確かめる。
// コメント中の語に反応しないよう、コメントを落としてから見る。
// ---------------------------------------------------------------------------
const NEXT_CONFIG = 'next.config.ts';
const nextConfigPath = join(ROOT, NEXT_CONFIG);
if (!existsSync(nextConfigPath)) {
  report('security-headers', NEXT_CONFIG, 'ファイルが無い（セキュリティヘッダーを確認できない）');
} else {
  const configSrc = stripJsComments(read(nextConfigPath));
  for (const header of ['X-Frame-Options', 'X-Content-Type-Options']) {
    if (!new RegExp(`key:\\s*['"]${header}['"]`).test(configSrc)) {
      report('security-headers', NEXT_CONFIG, `${header} ヘッダーが定義されていない`);
    }
  }
  if (!/\bpoweredByHeader:\s*false\b/.test(configSrc)) {
    report('security-headers', NEXT_CONFIG, 'poweredByHeader: false になっていない');
  }
}

// ---------------------------------------------------------------------------
// 11. サーバー専用モジュールに `import 'server-only'` があるか
//
// 監査 F-15。admin.ts は service_role キー（RLS を丸ごと迂回する）を、
// db/index.ts は DB 接続文字列を持つ。Client Component から誤って import されると
// バンドルに秘密が載りうる。`server-only` があればビルドで止まるが、
// 行が消えても何も落ちないので、ここで残っていることを確かめる。
// ---------------------------------------------------------------------------
const SERVER_ONLY_FILES = ['src/lib/supabase/admin.ts', 'src/db/index.ts'];
const SERVER_ONLY_RE = /^\s*import\s+['"]server-only['"]\s*;?\s*$/m;

for (const path of SERVER_ONLY_FILES) {
  const full = join(ROOT, path);
  if (!existsSync(full)) {
    report('server-only', path, 'ファイルが無い（server-only を確認できない）');
  } else if (!SERVER_ONLY_RE.test(read(full))) {
    report('server-only', path, "import 'server-only'; が無い");
  }
}

// ---------------------------------------------------------------------------
// 12. クライアントに露出する環境変数（NEXT_PUBLIC_*）が許可リスト内か
//
// 監査 F-15 系。NEXT_PUBLIC_ を付けた変数はビルド時にクライアントバンドルへ
// 埋め込まれる。秘密（service_role キー等）に誤って付けると、ブラウザから
// 誰でも読める。公開してよいものだけを許可リストに置き、それ以外の参照を止める。
// 新しく足すときは「ブラウザに配ってよい値か」を確認してからここに加える。
// ---------------------------------------------------------------------------
const ALLOWED_PUBLIC_ENV = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
]);

for (const file of walk(join(ROOT, 'src'), (p) => /\.(?:[cm]?[jt]sx?)$/.test(p))) {
  const found = new Set(read(file).match(/\bNEXT_PUBLIC_[A-Z0-9_]+/g) ?? []);
  for (const name of found) {
    if (ALLOWED_PUBLIC_ENV.has(name)) continue;
    report('public-env', rel(file), `${name} は許可リストに無い NEXT_PUBLIC_ 環境変数`);
  }
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
