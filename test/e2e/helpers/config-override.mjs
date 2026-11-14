/**
 * E2E config-override helper: merges overrides into window.SlideshowConfig
 * before main.js reads it (main.js captures the config once at startup).
 * Call before page.goto().
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, unknown>} overrides
 */
export async function overrideConfig(page, overrides) {
  await page.addInitScript((ov) => {
    let cfg = Object.assign({}, ov);
    Object.defineProperty(window, 'SlideshowConfig', {
      configurable: true,
      get() { return cfg; },
      set(v) { cfg = Object.assign({}, v, ov); },
    });
  }, overrides);
}
