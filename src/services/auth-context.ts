export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
}
