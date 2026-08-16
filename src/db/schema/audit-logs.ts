import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { authUsers } from './memberships';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => authUsers.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    changes: jsonb('changes'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_logs_org_id').on(t.orgId),
    index('idx_audit_logs_resource').on(t.resourceType, t.resourceId),
    index('idx_audit_logs_actor').on(t.actorUserId),
    index('idx_audit_logs_created_at').on(t.createdAt),
  ],
);
