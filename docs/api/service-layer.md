# Service Layer API 仕様

## 共通仕様

### AuthContext

```typescript
interface AuthContext {
  userId: string; // auth.users の id
  orgId: string; // 現在アクティブな組織の id
  role: Role; // 'owner' | 'admin' | 'member' | 'viewer'
}
```

### authorize()

```typescript
function authorize(
  ctx: AuthContext,
  action: 'create' | 'read' | 'update' | 'delete',
  resource: string,
  check?: (ctx: AuthContext) => boolean,
): void;
```

- `viewer` が write 操作を試みた場合は `AuthorizationError`
- カスタムチェック関数で細かな権限制御（例: member が自分の1on1のみ編集可能）

### hasMinRole()

```typescript
function hasMinRole(ctx: AuthContext, minRole: Role): boolean;
```

`owner > admin > member > viewer` の順序で比較する。
`authorize()` の第4引数に渡して使うのが基本形で、単独で権限判定を行わない。

```typescript
authorize(ctx, 'update', 'department', (c) => hasMinRole(c, 'admin'));
```

### Result 型

```typescript
type Result<T, E = string> = { success: true; data: T } | { success: false; error: E };
```

### writeAuditLog()

```typescript
async function writeAuditLog(
  ctx: AuthContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  changes?: Record<string, unknown>,
): Promise<void>;
```

**更新系（create / update / delete）** の Service メソッドの末尾で呼び出し、
操作を `audit_logs` に記録する。参照系は記録しない。
監査ログを書く経路はここだけ（DB トリガーによる自動記録は撤去済み）。

`writeAuditLog()` は機微フィールド（`birthDate` / `notes` / `comment` /
`aiSummary` / `ratings`）の**値を伏せる**。監査ログは全ロールが読めるため、
本文を残すとフィールド単位の可視制御が打ち消される。
フィールド名と変更があった事実は残る。

`audit_logs` はトリガーで UPDATE / DELETE を拒否している（追記のみ）。
そのため監査ログを持つ組織は通常の `DELETE` では消せず、削除には
DB 関数 `purge_organization()` を使う（後述）。

## Route Handler からの利用

`src/app/api/chat/` の AI アシスタントも Service Layer を経由する
（`getOrgSummary()` / `src/services/ai-context.ts`）。Route Handler から
Drizzle を直接呼ばない点は RSC / Server Action と同じ。

AI に渡すのは**個人を特定しない集計値だけ**にすること。個々の従業員名・
評価・1on1 の内容を混ぜると、ロール別・本人限定の可視制御を
AI の回答経由で迂回できてしまう。

## 本人限定の認可

ロール別の CRUD だけでは「member は自分が当事者のデータだけ扱える」を表現できない。
`src/services/self.ts` が、ログインユーザー（`auth.users`）と従業員レコードの
突き合わせを担う。

```typescript
function getOwnEmployeeId(ctx: AuthContext): Promise<string | null>;
```

`employees.user_id` を引く。**null（未紐付け）は「チェック不要」ではなく
「操作不可」に倒す。** 呼び出し側でここを取り違えると、紐付け前のユーザーに
全社のデータが開く。

紐付けはメールアドレスで自動的に行われる（`employee.ts` の
`resolveLinkedUserId`）。従業員の作成・更新時と招待受諾時の両方向で行う。
実務では「入社手続きで従業員レコードを登録 → 後からアカウントを発行」の
順になるため、片方向では漏れる。**この紐付けがあるため `employees` の書き込みは
admin 以上に限定している** — member がメールを自分のものに書き換えられると、
任意のレコードを「自分」に付け替えて本人限定の操作を奪える。

### 1on1 の閲覧範囲

```typescript
type OneOnOneScope =
  | { kind: 'all' } // admin 以上
  | { kind: 'party'; employeeId: string } // 自分が当事者のものだけ
  | { kind: 'none' }; // 未紐付け → 何も見えない

function getOneOnOneScope(ctx: AuthContext): Promise<OneOnOneScope>;
```

`listOneOnOnes` / `getOneOnOne` / `getEmployeeOneOnOnes` の**3経路すべて**に
同じ条件を掛ける。従業員詳細のタブから回り込む抜け道を作らない。
詳細取得で当事者でなかった場合は「見つかりません」を返す
（存在の有無を伝えると、誰と誰が 1on1 をしたかが ID の総当たりで分かる）。

## フィールド単位の可視制御

従業員・評価サイクルの read は全ロールに開いているため、行単位の認可では
機微な列を守れない。`src/services/field-visibility.ts` が読み取り時に
列を null へ潰す。

```typescript
function canReadBirthDate(ctx: AuthContext, employeeUserId: string | null): boolean;
function canReadEvaluationComment(
  ctx: AuthContext,
  evaluation: { evaluatorId: string; employeeId: string; status: string },
  ownEmployeeId: string | null,
): boolean;
```

| フィールド             | 返す相手                                     |
| ---------------------- | -------------------------------------------- |
| `employees.birth_date` | admin 以上 / 本人                            |
| `evaluations.comment`  | admin 以上 / 評価者 / 被評価者（確定後のみ） |

マスクは値を null に潰す形で行う。「マスクされている」事実自体を伝えない方が
安全で、既存の型（いずれも nullable）と UI（null は「—」表示）をそのまま使える。

admin 以上は無条件に見えるため、紐付けの解決クエリ（`getOwnEmployeeId`）は
member / viewer のときだけ発行する。

詳細は [`docs/database/authorization-matrix.md`](../database/authorization-matrix.md)。

## サービス一覧

| サービス        | 配置                               | 主な責務                                        |
| --------------- | ---------------------------------- | ----------------------------------------------- |
| Auth            | `src/services/auth.ts`             | 組織作成・メンバーシップ管理・招待承認          |
| AuthContext     | `src/services/auth-context.ts`     | AuthContext 型・Role 型の定義                   |
| Authorize       | `src/services/authorize.ts`        | authorize() / hasMinRole() / AuthorizationError |
| AuditLog        | `src/services/audit-log.ts`        | 監査ログの記録・一覧取得・リソース種別取得      |
| Self            | `src/services/self.ts`             | ログインユーザーと従業員レコードの突き合わせ    |
| FieldVisibility | `src/services/field-visibility.ts` | 個人情報のフィールド単位の可視性判定            |
| Dashboard       | `src/services/dashboard.ts`        | ダッシュボード統計・アクティビティ・集計        |
| Department      | `src/services/department.ts`       | 部署 CRUD・ツリー構造管理                       |
| Employee        | `src/services/employee.ts`         | 従業員 CRUD・アバター管理・部署一覧取得         |
| Evaluation      | `src/services/evaluation.ts`       | 評価サイクル CRUD・個別評価 CRUD                |
| OneOnOne        | `src/services/one-on-one.ts`       | 1on1記録 CRUD・従業員オプション取得             |
| Settings        | `src/services/settings.ts`         | 組織設定・メンバー管理・招待管理                |
| Skill           | `src/services/skill.ts`            | スキル CRUD・マトリクス・割当管理               |

## 各サービスのメソッド

### Auth (`src/services/auth.ts`)

| メソッド                                              | 認可                         | 説明                                |
| ----------------------------------------------------- | ---------------------------- | ----------------------------------- |
| `createOrganizationWithOwner(userId, orgName)`        | なし（認証ブートストラップ） | 組織作成 + owner メンバーシップ登録 |
| `getUserMemberships(userId)`                          | なし（認証ブートストラップ） | ユーザーの全メンバーシップ取得      |
| `switchOrganization(userId, orgId)`                   | なし（認証ブートストラップ） | 組織切替（メンバーシップ検証）      |
| `getInvitationByToken(token)`                         | なし（認証前アクセス）       | トークンから招待情報取得            |
| `acceptInvitation(invitationId, userId, orgId, role)` | なし（認証ブートストラップ） | 招待承認 + メンバーシップ登録       |
| `completePendingSignUp(userId, email, metadata)`      | なし（認証ブートストラップ） | メール確認後の組織作成 / 招待受諾   |

`completePendingSignUp()` は、メール確認が有効なときに保留していた組織作成・
招待受諾を消化する。確認前に作ると「誰も入れない組織」が残り、招待経路では
`accepted_at` だけが立って招待が消費されるため、作成内容を `user_metadata` に
預けて `/auth/callback` で実行する。

**`user_metadata` はクライアントから書き換えられる。** 預かった値を信用せず、
招待はトークンで DB から引き直し、確認済みメールとの一致と未所属であることを
検証する。詳細は [`docs/deployment.md`](../deployment.md)。

### Employee (`src/services/employee.ts`)

| メソッド                                            | 認可            | 説明                                       |
| --------------------------------------------------- | --------------- | ------------------------------------------ |
| `listEmployees(ctx, params)`                        | read:employee   | ページネーション・フィルタ・ソート付き一覧 |
| `getEmployee(ctx, id)`                              | read:employee   | 従業員詳細取得                             |
| `createEmployee(ctx, input)`                        | create:employee | 従業員登録                                 |
| `updateEmployee(ctx, id, input)`                    | update:employee | 従業員更新（部分更新）                     |
| `deleteEmployee(ctx, id)`                           | delete:employee | 従業員削除                                 |
| `getEmployeeSkills(ctx, employeeId)`                | read:employee   | 従業員のスキル一覧                         |
| `getEmployeeOneOnOnes(ctx, employeeId)`             | read:employee   | 従業員の1on1履歴                           |
| `getEmployeeEvaluations(ctx, employeeId)`           | read:employee   | 従業員の評価履歴                           |
| `updateEmployeeAvatar(ctx, employeeId, avatarPath)` | update:employee | アバターパス更新                           |
| `getDepartmentsForOrg(ctx)`                         | read:employee   | フィルタ用の部署一覧                       |

### Department (`src/services/department.ts`)

| メソッド                           | 認可              | 説明                     |
| ---------------------------------- | ----------------- | ------------------------ |
| `listDepartments(ctx)`             | read:department   | フラット一覧             |
| `getDepartmentTree(ctx)`           | read:department   | ツリー構造で取得         |
| `getDepartment(ctx, id)`           | read:department   | 部署詳細                 |
| `createDepartment(ctx, input)`     | create:department | 部署作成                 |
| `updateDepartment(ctx, id, input)` | update:department | 部署更新（名前・親変更） |
| `deleteDepartment(ctx, id)`        | delete:department | 部署削除                 |

#### 親部署の所属テナント検証

`createDepartment` / `updateDepartment` は `parentId` が指定された場合、
**その親が自組織に実在することを `org_id` 付きのクエリで確認する**。
この検証が無いと、他テナントの部署 ID を親に指定でき、テナントを跨いだ
`parent_id` が保存される。以下のいずれもこれを止められない。

- **FK 制約**: `departments.id` を参照するだけなので、他テナントの行でも成立する
- **RLS**: 更新対象の行は自組織なのでポリシーを通る
- **循環参照チェック（`checkIsDescendant`）**: 自組織の部署しか読まないため、
  他テナントの ID は「祖先ではない」と判定されて素通りする

`updateDepartment` はさらに、自分自身を親にする指定（`parentId === id`）と、
自分の子孫を親にする指定（ツリーが循環して一覧描画が無限ループする）も拒否する。

### Skill (`src/services/skill.ts`)

| メソッド                                          | 認可                  | 説明                           |
| ------------------------------------------------- | --------------------- | ------------------------------ |
| `listSkills(ctx, params)`                         | read:skill            | ページネーション付きスキル一覧 |
| `getSkill(ctx, id)`                               | read:skill            | スキル詳細                     |
| `createSkill(ctx, input)`                         | create:skill          | スキル登録                     |
| `updateSkill(ctx, input)`                         | update:skill          | スキル更新                     |
| `deleteSkill(ctx, id)`                            | delete:skill          | スキル削除                     |
| `getCategories(ctx)`                              | read:skill            | カテゴリ一覧                   |
| `getSkillMatrix(ctx, params)`                     | read:skill            | スキルマトリクス取得           |
| `assignSkill(ctx, input)`                         | create:employee_skill | スキル割当                     |
| `removeSkillAssignment(ctx, employeeId, skillId)` | delete:employee_skill | スキル割当解除                 |

### OneOnOne (`src/services/one-on-one.ts`)

| メソッド                     | 認可              | 説明                         |
| ---------------------------- | ----------------- | ---------------------------- |
| `listOneOnOnes(ctx, params)` | read:one_on_one   | ページネーション付き1on1一覧 |
| `getOneOnOne(ctx, id)`       | read:one_on_one   | 1on1詳細                     |
| `createOneOnOne(ctx, input)` | create:one_on_one | 1on1記録作成                 |
| `updateOneOnOne(ctx, input)` | update:one_on_one | 1on1記録更新                 |
| `deleteOneOnOne(ctx, id)`    | delete:one_on_one | 1on1記録削除                 |
| `getEmployeesForOrg(ctx)`    | read:employee     | セレクタ用の従業員一覧       |

### Evaluation (`src/services/evaluation.ts`)

| メソッド                       | 認可                    | 説明                         |
| ------------------------------ | ----------------------- | ---------------------------- |
| `listCycles(ctx)`              | read:evaluation_cycle   | 評価サイクル一覧             |
| `getCycle(ctx, id)`            | read:evaluation_cycle   | サイクル詳細（評価一覧付き） |
| `createCycle(ctx, input)`      | create:evaluation_cycle | サイクル作成                 |
| `updateCycle(ctx, input)`      | update:evaluation_cycle | サイクル更新                 |
| `deleteCycle(ctx, id)`         | delete:evaluation_cycle | サイクル削除                 |
| `createEvaluation(ctx, input)` | create:evaluation       | 評価追加                     |
| `updateEvaluation(ctx, input)` | update:evaluation       | 評価更新                     |
| `deleteEvaluation(ctx, id)`    | delete:evaluation       | 評価削除                     |

### Settings (`src/services/settings.ts`)

| メソッド                              | 認可                | 説明             |
| ------------------------------------- | ------------------- | ---------------- |
| `getOrgInfo(ctx)`                     | read:organization   | 組織情報取得     |
| `updateOrg(ctx, input)`               | update:organization | 組織情報更新     |
| `listMembers(ctx)`                    | read:membership     | メンバー一覧     |
| `changeRole(ctx, input)`              | update:membership   | ロール変更       |
| `removeMember(ctx, membershipId)`     | delete:membership   | メンバー除外     |
| `createInvitation(ctx, input)`        | create:invitation   | 招待作成         |
| `listPendingInvitations(ctx)`         | read:invitation     | 保留中の招待一覧 |
| `revokeInvitation(ctx, invitationId)` | delete:invitation   | 招待取り消し     |

#### 組織の削除について

組織そのものの削除は Service Layer に持たせていない。監査ログが
`audit_logs` に残っている組織は通常の `DELETE` では消せず
（トリガーが削除・更新を拒否し、カスケード削除も FK 違反で失敗する）、
DB 関数 `public.purge_organization(org_id)` を `service_role` で実行する
運用手順になっている。詳細と実行手順は
[マルチテナンシー設計](../architecture/multi-tenancy.md) を参照。

### AuditLog (`src/services/audit-log.ts`)

| メソッド                                                         | 認可             | 説明                             |
| ---------------------------------------------------------------- | ---------------- | -------------------------------- |
| `writeAuditLog(ctx, action, resourceType, resourceId, changes?)` | なし（内部関数） | 監査ログ記録                     |
| `listAuditLogs(ctx, params)`                                     | read:audit_log   | ページネーション付き監査ログ一覧 |
| `getResourceTypes(ctx)`                                          | read:audit_log   | フィルタ用リソース種別一覧       |

### Dashboard (`src/services/dashboard.ts`)

| メソッド                             | 認可           | 説明                                                     |
| ------------------------------------ | -------------- | -------------------------------------------------------- |
| `getDashboardStats(ctx)`             | read:dashboard | 統計カード（従業員数・部署数・スキル数・評価サイクル数） |
| `getRecentActivity(ctx, limit = 10)` | read:dashboard | 最近のアクティビティ                                     |
| `getDepartmentHeadcounts(ctx)`       | read:dashboard | 部署別人員構成                                           |
| `getSkillCategoryCounts(ctx)`        | read:dashboard | スキルカテゴリ別集計                                     |
| `getEmployeeStatusCounts(ctx)`       | read:dashboard | 従業員ステータス別集計                                   |
