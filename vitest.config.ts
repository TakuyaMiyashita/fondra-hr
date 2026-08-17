import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

// テストは3つの project に分かれている。
//   unit        … DB 不要。jsdom 上で Service Layer とユーティリティを検証する。
//   integration … ローカル Supabase (npx supabase start) が必要。
//                 Supabase Auth API に対して認証フローを検証する。
//   rls         … ローカル Supabase が必要。
//                 実 DB に対して RLS ポリシーのテナント分離を検証する。
// CI では DB 不要な unit を先に回し、integration / rls は Supabase 起動後のジョブで回す。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'rls',
          environment: 'node',
          include: ['tests/rls/**/*.test.ts'],
        },
      },
    ],
  },
});
