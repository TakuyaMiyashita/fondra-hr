import { pgTable, text, timestamp, uuid, date, unique, index } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { authUsers } from './memberships';
import { departments } from './departments';

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => authUsers.id, { onDelete: 'set null' }),
    departmentId: uuid('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    employeeCode: text('employee_code').notNull(),
    fullName: text('full_name').notNull(),
    fullNameKana: text('full_name_kana'),
    email: text('email'),
    position: text('position'),
    hiredOn: date('hired_on'),
    birthDate: date('birth_date'),
    avatarPath: text('avatar_path'),
    status: text('status', { enum: ['active', 'inactive', 'retired'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('employees_org_id_employee_code_key').on(t.orgId, t.employeeCode),
    index('idx_employees_org_id').on(t.orgId),
    index('idx_employees_department_id').on(t.departmentId),
    index('idx_employees_user_id').on(t.userId),
  ],
);
