// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // ── ignored paths ────────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      'pnpm-lock.yaml',
    ],
  },

  // ── base JS rules ─────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript (all .ts / .tsx) ────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Node environment (API + scripts) ──────────────────────────────────────
  {
    files: ['services/**/*.{ts,mjs}', 'scripts/**/*.{mjs,js}', '*.{mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
  },

  // ── Browser + Node environment (Next.js web app) ──────────────────────────
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // ── Project-wide TypeScript overrides ─────────────────────────────────────
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
);
