// ESLint for the JavaScript of the three Node packages (HC-001, ADR 0140). TypeScript is checked by
// `tsc` (strict, noUnusedLocals, noUnusedParameters): typescript-eslint does not support
// TypeScript 7 yet.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/fixtures/**', '**/test/golden/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      ...js.configs.recommended.rules,
      // `({ omitted, ...rest }) => rest` drops a property on purpose.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
];
