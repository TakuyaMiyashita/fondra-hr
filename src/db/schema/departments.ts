import { type AnyPgColumn, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => departments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_departments_org_id').on(t.orgId),
    index('idx_departments_parent_id').on(t.parentId),
  ],
);
