import js from '@eslint/js';
import globals from 'globals';
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'vendor/**',
      'assets/**',
      'drizzle/**',
      '.sites-runtime/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {},
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['*.js'],
    ignores: ['sw.js', '*.config.js'],
    languageOptions: { globals: globals.browser },
  },
  { files: ['sw.js'], languageOptions: { globals: globals.serviceworker } },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
];
