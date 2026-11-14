/**
 * E2E mock-album helper: serves albums with chosen photo counts and aspect
 * ratios by routing /album/35 and the photo URLs in the browser (test-only,
 * no server changes). Call mockAlbums() before page.goto().
 */
import sharp from 'sharp';
import { generateAbstractJpeg } from '../../fixtures/lib/abstract-image.mjs';

export const LANDSCAPE = { w: 3000, h: 2000 };
export const PORTRAIT = { w: 2000, h: 3000 };
export const PANORAMA = { w: 6000, h: 2000 };
export const SQUARE = { w: 2000, h: 2000 };

const SCALE = 4;            // original = size / 4 (same aspect)
const THUMB_LONG_EDGE = { M: 320, XL: 1280 };

function pad(n) {
  return String(n).padStart(2, '0');
}

// Deterministic, distinct color per (album, index)
function colorFor(albumIdx, photoIdx) {
  const hue = ((albumIdx * 7 + photoIdx) * 47) % 360;
  const c = (n) => Math.round(128 + 100 * Math.sin((hue + n) * Math.PI / 180));
  return { r: c(0), g: c(120), b: c(240) };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Array<Array<{w:number,h:number}>>} albums
 * @param {{thumbnails?: boolean, abstract?: boolean}} [opts] abstract: serve labelled
 *   abstract images (A<album>-<photo>) instead of solid colours
 * @returns {Promise<{requests: string[]}>} every photo URL requested, in order
 */
export async function mockAlbums(page, albums, opts = {}) {
  const thumbnails = opts.thumbnails !== false;
  const abstract = opts.abstract === true;
  const requests = [];
  const cache = new Map();
  let albumRequests = 0;

  await page.route('**/album/35*', async (route) => {
    const n = albumRequests++;
    const idx = Math.min(n, albums.length - 1);
    const sizes = albums[idx];
    const images = sizes.map((_, i) => ({
      Orientation: 1,
      file: `photos/2024/Mock Album ${idx}/p${pad(i)}.jpg`,
    }));
    await route.fulfill({ json: { count: images.length, images } });
  });

  await page.route(/\/photos\/2024\/Mock(%20| )Album(%20| )\d+\/.*\.jpg(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    requests.push(path);
    const m = /Mock Album (\d+)\/(?:@eaDir\/)?p(\d+)\.jpg(?:\/SYNOPHOTO_THUMB_(M|XL)\.jpg)?$/.exec(path);
    const size = m && albums[+m[1]] && albums[+m[1]][+m[2]];
    if (!size) return route.fulfill({ status: 404 });
    const quality = m[3] || 'original';
    if (quality !== 'original' && !thumbnails) return route.fulfill({ status: 404 });

    const key = `${m[1]}/${m[2]}/${quality}`;
    if (!cache.has(key)) {
      let width = Math.max(1, Math.round(size.w / SCALE));
      let height = Math.max(1, Math.round(size.h / SCALE));
      if (quality !== 'original') {
        const k = THUMB_LONG_EDGE[quality] / Math.max(size.w, size.h);
        width = Math.max(1, Math.round(size.w * k));
        height = Math.max(1, Math.round(size.h * k));
      }
      cache.set(key, abstract
        ? generateAbstractJpeg({
          width, height, seed: +m[1] * 1000 + +m[2], label: `A${m[1]}-${m[2]}`,
        })
        : sharp({
          create: { width, height, channels: 3, background: colorFor(+m[1], +m[2]) },
        }).jpeg().toBuffer());
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: await cache.get(key),
    });
  });

  return { requests };
}
