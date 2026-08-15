import type { AuthContext, Role } from './auth-context';

type Action = 'create' | 'read' | 'update' | 'delete';

const WRITE_ACTIONS: Action[] = ['create', 'update', 'delete'];

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export class AuthorizationError extends Error {
  constructor(
    public readonly action: Action,
    public readonly resource: string,
  ) {
    super(`Unauthorized: ${action} on ${resource}`);
    this.name = 'AuthorizationError';
  }
}

export function authorize(
  ctx: AuthContext,
  action: Action,
  resource: string,
  check?: (ctx: AuthContext) => boolean,
): void {
  if (ctx.role === 'viewer' && WRITE_ACTIONS.includes(action)) {
    throw new AuthorizationError(action, resource);
  }

  if (check && !check(ctx)) {
    throw new AuthorizationError(action, resource);
  }
}

export function hasMinRole(ctx: AuthContext, minRole: Role): boolean {
  return ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY[minRole];
}
