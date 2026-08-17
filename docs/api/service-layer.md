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
  resourceId: string,
  changes?: Record<string, unknown>,
): Promise<void>;
```

全 Service メソッドの末尾で呼び出し、操作を `audit_logs` に記録する。

## サービス一覧

| サービス    | 配置                           | 主な責務                                        |
| ----------- | ------------------------------ | ----------------------------------------------- |
| Auth        | `src/services/auth.ts`         | 組織作成・メンバーシップ管理・招待承認          |
| AuthContext | `src/services/auth-context.ts` | AuthContext 型・Role 型の定義                   |
| Authorize   | `src/services/authorize.ts`    | authorize() / hasMinRole() / AuthorizationError |
| AuditLog    | `src/services/audit-log.ts`    | 監査ログの記録・一覧取得・リソース種別取得      |
| Dashboard   | `src/services/dashboard.ts`    | ダッシュボード統計・アクティビティ・集計        |
| Department  | `src/services/department.ts`   | 部署 CRUD・ツリー構造管理                       |
| Employee    | `src/services/employee.ts`     | 従業員 CRUD・アバター管理・部署一覧取得         |
| Evaluation  | `src/services/evaluation.ts`   | 評価サイクル CRUD・個別評価 CRUD                |
| OneOnOne    | `src/services/one-on-one.ts`   | 1on1記録 CRUD・従業員オプション取得             |
| Settings    | `src/services/settings.ts`     | 組織設定・メンバー管理・招待管理                |
| Skill       | `src/services/skill.ts`        | スキル CRUD・マトリクス・割当管理               |

## 各サービスのメソッド

### Auth (`src/services/auth.ts`)

| メソッド                                              | 認可                         | 説明                                |
| ----------------------------------------------------- | ---------------------------- | ----------------------------------- |
| `createOrganizationWithOwner(userId, orgName, email)` | なし（認証ブートストラップ） | 組織作成 + owner メンバーシップ登録 |
| `getUserMemberships(userId)`                          | なし（認証ブートストラップ） | ユーザーの全メンバーシップ取得      |
| `switchOrganization(userId, orgId)`                   | なし（認証ブートストラップ） | 組織切替                            |
| `getInvitationByToken(token)`                         | なし（認証前アクセス）       | トークンから招待情報取得            |
| `acceptInvitation(invitationId, userId, orgId, role)` | なし（認証ブートストラップ） | 招待承認 + メンバーシップ登録       |

### Employee (`src/services/employee.ts`)

| メソッド                                            | 認可            | 説明                                       |
| --------------------------------------------------- | --------------- | ------------------------------------------ |
| `listEmployees(ctx, params)`                        | read:employee   | ページネーション・フィルタ・ソート付き一覧 |
| `getEmployee(ctx, id)`                              | read:employee   | 従業員詳細取得                             |
| `createEmployee(ctx, input)`                        | create:employee | 従業員登録                                 |
| `updateEmployee(ctx, input)`                        | update:employee | 従業員更新                                 |
| `deleteEmployee(ctx, id)`                           | delete:employee | 従業員削除                                 |
| `getEmployeeSkills(ctx, employeeId)`                | read:employee   | 従業員のスキル一覧                         |
| `getEmployeeOneOnOnes(ctx, employeeId)`             | read:employee   | 従業員の1on1履歴                           |
| `getEmployeeEvaluations(ctx, employeeId)`           | read:employee   | 従業員の評価履歴                           |
| `updateEmployeeAvatar(ctx, employeeId, avatarPath)` | update:employee | アバターパス更新                           |
| `getDepartmentsForOrg(ctx)`                         | read:employee   | フィルタ用の部署一覧                       |

### Department (`src/services/department.ts`)

| メソッド                       | 認可              | 説明                     |
| ------------------------------ | ----------------- | ------------------------ |
| `listDepartments(ctx)`         | read:department   | フラット一覧             |
| `getDepartmentTree(ctx)`       | read:department   | ツリー構造で取得         |
| `getDepartment(ctx, id)`       | read:department   | 部署詳細                 |
| `createDepartment(ctx, input)` | create:department | 部署作成                 |
| `updateDepartment(ctx, input)` | update:department | 部署更新（名前・親変更） |
| `deleteDepartment(ctx, id)`    | delete:department | 部署削除                 |

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

| メソッド                                 | 認可                | 説明             |
| ---------------------------------------- | ------------------- | ---------------- |
| `getOrgInfo(ctx)`                        | read:organization   | 組織情報取得     |
| `updateOrg(ctx, input)`                  | update:organization | 組織情報更新     |
| `listMembers(ctx)`                       | read:membership     | メンバー一覧     |
| `changeRole(ctx, membershipId, newRole)` | update:membership   | ロール変更       |
| `removeMember(ctx, membershipId)`        | delete:membership   | メンバー除外     |
| `createInvitation(ctx, input)`           | create:invitation   | 招待作成         |
| `listPendingInvitations(ctx)`            | read:invitation     | 保留中の招待一覧 |
| `revokeInvitation(ctx, id)`              | delete:invitation   | 招待取り消し     |

### AuditLog (`src/services/audit-log.ts`)

| メソッド                                                         | 認可             | 説明                             |
| ---------------------------------------------------------------- | ---------------- | -------------------------------- |
| `writeAuditLog(ctx, action, resourceType, resourceId, changes?)` | なし（内部関数） | 監査ログ記録                     |
| `listAuditLogs(ctx, params)`                                     | read:audit_log   | ページネーション付き監査ログ一覧 |
| `getResourceTypes(ctx)`                                          | read:audit_log   | フィルタ用リソース種別一覧       |

### Dashboard (`src/services/dashboard.ts`)

| メソッド                       | 認可           | 説明                                                     |
| ------------------------------ | -------------- | -------------------------------------------------------- |
| `getDashboardStats(ctx)`       | read:dashboard | 統計カード（従業員数・部署数・スキル数・評価サイクル数） |
| `getRecentActivity(ctx)`       | read:dashboard | 最近のアクティビティ                                     |
| `getDepartmentHeadcounts(ctx)` | read:dashboard | 部署別人員構成                                           |
| `getSkillCategoryCounts(ctx)`  | read:dashboard | スキルカテゴリ別集計                                     |
| `getEmployeeStatusCounts(ctx)` | read:dashboard | 従業員ステータス別集計                                   |
