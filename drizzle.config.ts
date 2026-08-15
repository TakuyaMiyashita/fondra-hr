import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './supabase/migrations',
  schema: './src/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['public'],
});
