export interface AuditLog {
  id: string;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogListResult {
  logs: AuditLog[];
  total: number;
}
