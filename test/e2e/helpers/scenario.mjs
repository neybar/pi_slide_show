/**
 * E2E scenario helper: makes the page load its album from the real server's
 * test-only GET /album/scenario/:name route (a directory under
 * <PHOTO_LIBRARY>/scenarios/<name>) instead of a random album. Unlike
 * mock-album.mjs, discovery, EXIF Orientation and thumbnails go through the
 * server. The route is disabled when NODE_ENV=production. Call before page.goto().
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name scenario directory name, /^[a-z0-9-]+$/
 */
export async function useScenario(page, name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Invalid scenario name: ${name}`);
  }
  await page.route('**/album/35*', (route) => {
    const origin = new URL(route.request().url()).origin;
    return route.continue({ url: `${origin}/album/scenario/${name}` });
  });
}
