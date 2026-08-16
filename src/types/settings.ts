import type { Role } from '@/services/auth-context';

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface OrgMember {
  id: string;
  userId: string;
  email: string | null;
  role: Role;
  createdAt: Date;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}
