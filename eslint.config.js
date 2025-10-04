// eslint.config.js

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script', // change to 'script' if you're using CommonJS
      globals: {
        window: 'readonly',
        document: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/no-unresolved': 'off',
      'prettier/prettier': 'warn',
    },
  },
];
