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
      // Base UI の Button に Link を差し込むと、既定（nativeButton = true）では
      // `<a>` に無効な `type="button"` が付き、`nativeButton={false}` にすると
      // 今度は `role="button"` がリンク本来の role を上書きする。
      // 遷移する要素は ButtonLink（素の `<a>` + buttonVariants）を使う。
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXElement[openingElement.name.name="Button"] > JSXOpeningElement > JSXAttribute[name.name="render"] JSXOpeningElement[name.name="Link"]',
          message:
            '<Button render={<Link />}> は使わず、@/components/shared/button-link の ButtonLink を使ってください。',
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
