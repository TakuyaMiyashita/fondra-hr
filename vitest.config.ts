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
    // カバレッジ計測の対象は「自分たちで書いたロジック」に限定する。
    // UI コンポーネントや自動生成物まで含めると、数値が薄まって
    // 本当に検証すべき箇所（Service Layer の認可・分岐）が見えなくなる。
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/services/**/*.ts', 'src/lib/**/*.ts', 'src/app/**/actions.ts'],
      exclude: ['src/lib/supabase/**', 'src/**/*.d.ts'],
      // 到達した水準は下げない。回帰防止のための下限。
      //
      // branches だけ 99 なのは、employees/actions.ts の
      // `(file.name.split('.').pop() ?? '')` の `?? ''` 側が実行時には
      // 到達不能なため（String.prototype.split は必ず長さ1以上の配列を返す）。
      // TypeScript は pop() を string | undefined と推論するので式自体は消せない。
      thresholds: {
        statements: 100,
        branches: 99,
        functions: 100,
        lines: 100,
      },
    },
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
