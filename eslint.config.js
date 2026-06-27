import tseslint from '@typescript-eslint/parser';
import tsplugin from '@typescript-eslint/eslint-plugin';
import vitestPlugin from 'eslint-plugin-vitest';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsplugin,
      vitest: vitestPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'eqeqeq': ['error', 'smart'],
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'src/**/*.js', 'vite.config.js', '*.config.js', '.vite/**'],
  },
];
