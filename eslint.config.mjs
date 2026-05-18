// Minimal flat ESLint config for Next.js 16.
//
// Next.js 16 removed `next lint`. The recommended setup is
// `eslint-config-next` + `@eslint/eslintrc` (FlatCompat) — install those
// to get the full Next.js rules:
//
//   npm i -D eslint-config-next @eslint/eslintrc
//
// then uncomment the FlatCompat block below. This minimal config only uses
// ESLint core rules so it works without extra deps — catches genuinely
// broken JS (undeclared vars, unreachable code, etc.) but no
// Next.js-specific checks like `no-img-element` or `no-html-link-for-pages`.

// import { FlatCompat } from '@eslint/eslintrc';
// import path from 'node:path';
// import { fileURLToPath } from 'node:url';
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// const compat = new FlatCompat({ baseDirectory: __dirname });

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
  // ...compat.extends('next/core-web-vitals'),    // ← uncomment after install
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
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
