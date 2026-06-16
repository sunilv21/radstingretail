// Flat ESLint config for Next.js 16.
//
// Next.js 16 removed `next lint`. Lint via `npm run lint` (eslint .) instead.
// TypeScript files are parsed by `typescript-eslint`; rules stay minimal so
// the gate catches genuinely broken code without forcing a stylistic
// rewrite of the existing codebase. `npx tsc --noEmit` is still the
// authoritative type check — ESLint here only catches syntactic / logic
// mistakes the type-checker doesn't (unreachable code, duplicate keys,
// self-comparisons, etc.).
//
// To layer in Next.js-specific rules (no-img-element, no-html-link-for-pages):
//   npm i -D eslint-config-next @eslint/eslintrc
// then wire in FlatCompat — see the eslint-config-next docs.

import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

// Plugins are registered (not enforced) so the existing
// `// eslint-disable-next-line @next/next/...` and `react-hooks/...`
// comments scattered through the codebase resolve cleanly. To start
// enforcing any of these rules, move them into the `rules:` block below.
const registeredPlugins = {
  '@next/next': nextPlugin,
  'react-hooks': reactHooks,
  '@typescript-eslint': tseslint.plugin,
};

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'server/**',
      'api/**',
      'public/**',
      '**/*.config.{js,mjs,cjs}',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: registeredPlugins,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLIFrameElement: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        crypto: 'readonly',
        React: 'readonly',
        JSX: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-undef': 'off', // TS catches this at compile time
      'no-unused-vars': 'off', // TS catches unused vars more accurately
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
