// Garde-fou de structure : tout nom utilisé doit être importé ou global au navigateur.
import globals from 'globals';

export default [
  { ignores: ['index.html', 'test.html', 'vendor/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'tools/**/*.{js,mjs}', '*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, THREE: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-const-assign': 'error',
      'no-import-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
];
