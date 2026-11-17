import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').notNull().default('free'),
  // 公開デモの組織か。Storage ポリシーが書き込み拒否の判定に使う
  // （20260829000001）。アプリ側の判定は DEMO_READONLY_ORG_ID（ADR 0012）。
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
