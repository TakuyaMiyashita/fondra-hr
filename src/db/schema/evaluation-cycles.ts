import { pgTable, text, timestamp, uuid, date, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const evaluationCycles = pgTable(
  'evaluation_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status', { enum: ['draft', 'in_progress', 'completed'] })
      .notNull()
      .default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_evaluation_cycles_org_id').on(t.orgId)],
);
