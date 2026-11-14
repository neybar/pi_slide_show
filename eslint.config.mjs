// Display-browser compatibility guard for www/js only (see AGENTS.md "Easy to break").
// The target browser version lives in package.json "browserslist". ecmaVersion below must match
// it: Chrome 76 = ES2019 (no ?., ??, class fields, top-level await). Server code is not linted.
import compat from 'eslint-plugin-compat';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**'] },
  compat.configs['flat/recommended'],
  {
    files: ['www/js/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: 'module',
      globals: { ...globals.browser, $: 'readonly', jQuery: 'readonly', _: 'readonly', loadImage: 'readonly' },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
  },
];
