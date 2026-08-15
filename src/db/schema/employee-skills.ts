import { pgTable, timestamp, uuid, integer, date, unique, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { employees } from './employees';
import { skills } from './skills';

export const employeeSkills = pgTable(
  'employee_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    level: integer('level').notNull(),
    certifiedAt: date('certified_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('employee_skills_employee_id_skill_id_key').on(t.employeeId, t.skillId),
    index('idx_employee_skills_org_id').on(t.orgId),
    index('idx_employee_skills_employee_id').on(t.employeeId),
    index('idx_employee_skills_skill_id').on(t.skillId),
  ],
);
