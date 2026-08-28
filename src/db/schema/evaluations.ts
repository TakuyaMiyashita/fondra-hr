import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { evaluationCycles } from './evaluation-cycles';
import { employees } from './employees';

export const evaluations = pgTable(
  'evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => evaluationCycles.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    evaluatorId: uuid('evaluator_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    ratings: jsonb('ratings'),
    comment: text('comment'),
    status: text('status', {
      enum: ['draft', 'in_progress', 'submitted', 'confirmed', 'returned'],
    })
      .notNull()
      .default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_evaluations_org_id').on(t.orgId),
    index('idx_evaluations_cycle_id').on(t.cycleId),
    index('idx_evaluations_employee_id').on(t.employeeId),
    index('idx_evaluations_evaluator_id').on(t.evaluatorId),
  ],
);
