import { pgTable, text, timestamp, uuid, unique, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('skills_org_id_name_key').on(t.orgId, t.name),
    index('idx_skills_org_id').on(t.orgId),
  ],
);
