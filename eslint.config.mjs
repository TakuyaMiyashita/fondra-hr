import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_` prefix は意図的な未使用（分割代入での除外用捨て変数など）として許容する
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Supabase local dev temp files
    'supabase/.temp/**',
    // Vitest のカバレッジ HTML レポート（生成物）
    'coverage/**',
    // Playwright の実行成果物
    'test-results/**',
    'playwright-report/**',
    // サブエージェント用の git worktree。中に node_modules を持つため、
    // 除外しないと ESLint が依存関係まで走査して数千件の警告を出す。
    '.claude/worktrees/**',
  ]),
]);

export default eslintConfig;
