// ESLint for the JavaScript of the four Node packages (HC-001, ADR 0140). TypeScript is checked by
// `tsc` (strict, noUnusedLocals, noUnusedParameters): typescript-eslint does not support
// TypeScript 7 yet.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**'],
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
  {
    // The desktop app's preload script must be CommonJS (Electron's sandboxed preload, ADR 0190).
    files: ['**/*.cjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
];
