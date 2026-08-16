import { pgTable, text, timestamp, uuid, integer, date, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { employees } from './employees';

export const oneOnOnes = pgTable(
  'one_on_ones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    interviewerId: uuid('interviewer_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    heldOn: date('held_on').notNull(),
    notes: text('notes'),
    aiSummary: text('ai_summary'),
    moodScore: integer('mood_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_one_on_ones_org_id').on(t.orgId),
    index('idx_one_on_ones_employee_id').on(t.employeeId),
    index('idx_one_on_ones_interviewer_id').on(t.interviewerId),
    index('idx_one_on_ones_held_on').on(t.heldOn),
  ],
);
