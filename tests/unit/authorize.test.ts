import { describe, expect, it } from 'vitest';

import type { AuthContext } from '@/services/auth-context';
import { AuthorizationError, authorize, hasMinRole } from '@/services/authorize';

const makeCtx = (role: AuthContext['role']): AuthContext => ({
  userId: 'user-1',
  orgId: 'org-1',
  role,
});

describe('authorize', () => {
  it('allows owner to perform any action', () => {
    expect(() => authorize(makeCtx('owner'), 'delete', 'employee')).not.toThrow();
  });

  it('allows admin to perform any action', () => {
    expect(() => authorize(makeCtx('admin'), 'create', 'employee')).not.toThrow();
  });

  it('allows member to read', () => {
    expect(() => authorize(makeCtx('member'), 'read', 'employee')).not.toThrow();
  });

  it('blocks viewer from write actions', () => {
    expect(() => authorize(makeCtx('viewer'), 'create', 'employee')).toThrow(AuthorizationError);
    expect(() => authorize(makeCtx('viewer'), 'update', 'employee')).toThrow(AuthorizationError);
    expect(() => authorize(makeCtx('viewer'), 'delete', 'employee')).toThrow(AuthorizationError);
  });

  it('allows viewer to read', () => {
    expect(() => authorize(makeCtx('viewer'), 'read', 'employee')).not.toThrow();
  });

  it('applies custom check function', () => {
    const denyAll = () => false;
    expect(() => authorize(makeCtx('admin'), 'update', 'employee', denyAll)).toThrow(
      AuthorizationError,
    );
  });
});

describe('hasMinRole', () => {
  it('checks role hierarchy correctly', () => {
    expect(hasMinRole(makeCtx('owner'), 'admin')).toBe(true);
    expect(hasMinRole(makeCtx('admin'), 'admin')).toBe(true);
    expect(hasMinRole(makeCtx('member'), 'admin')).toBe(false);
    expect(hasMinRole(makeCtx('viewer'), 'member')).toBe(false);
  });
});
