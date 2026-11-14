// Display-browser compatibility guard for the compiled www/css/main.scss (see AGENTS.md
// "Easy to break"). Target browser version: package.json "browserslist". Run via `npm run lint:compat`.
export default {
  plugins: ['stylelint-no-unsupported-browser-features'],
  rules: {
    'plugin/no-unsupported-browser-features': [
      true,
      {
        severity: 'error',
        // caniuse reports every `overflow` declaration as "partial" because Chrome < 90 lacks
        // `overflow: clip`. We only use hidden/auto/visible, which Chrome 76 supports, so this
        // is a false positive.
        ignore: ['css-overflow'],
      },
    ],
  },
};
