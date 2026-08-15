# Service Layer API 仕様

> Phase 2 以降の実装で各 Service メソッドを追記する。

## 共通仕様

### AuthContext

```typescript
interface AuthContext {
  userId: string;   // auth.users の id
  orgId: string;    // 現在アクティブな組織の id
  role: Role;       // 'owner' | 'admin' | 'member' | 'viewer'
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
type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };
```

## サービス一覧

| サービス | 配置 | 追加フェーズ |
|---------|------|-------------|
| OrganizationService | `src/services/organizations.ts` | Phase 2 |
| MembershipService | `src/services/memberships.ts` | Phase 2 |
| InvitationService | `src/services/invitations.ts` | Phase 2 |
| EmployeeService | `src/services/employees.ts` | Phase 3-1 |
| DepartmentService | `src/services/departments.ts` | Phase 3-2 |
| SkillService | `src/services/skills.ts` | Phase 3-3 |
| OneOnOneService | `src/services/one-on-ones.ts` | Phase 3-4 |
| EvaluationService | `src/services/evaluations.ts` | Phase 3-5 |
| AuditLogService | `src/services/audit-logs.ts` | Phase 3-6 |
| AIService | `src/services/ai.ts` | Phase 4 |
