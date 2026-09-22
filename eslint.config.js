import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    files: ['api/**/*.js', 'lib/**/*.mjs', 'public/src/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: js.configs.recommended.rules,
  },
];
