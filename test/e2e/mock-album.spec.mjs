import { test, expect } from '@playwright/test';
import { mockAlbums, PORTRAIT, LANDSCAPE, PANORAMA } from './helpers/mock-album.mjs';

async function firstRatio(page) {
  await expect(page.locator('.album_name')).toHaveText('2024 Mock Album 0');
  const handle = await page.waitForFunction(() => {
    const img = [...document.querySelectorAll('img')].find(
      (i) => i.complete && i.naturalWidth > 0 && /Mock(%20| )Album/.test(i.src));
    return img ? img.naturalWidth / img.naturalHeight : null;
  });
  return handle.jsonValue();
}

test.describe('mockAlbums helper', () => {
  test('serves a 1-photo portrait album', async ({ page }) => {
    const { requests } = await mockAlbums(page, [[PORTRAIT]]);
    await page.goto('/');
    expect(await firstRatio(page)).toBeCloseTo(PORTRAIT.w / PORTRAIT.h, 1);
    expect(requests.length).toBeGreaterThan(0);
  });

  test('abstract: true serves labelled non-solid images', async ({ page }) => {
    const { requests } = await mockAlbums(page, [[LANDSCAPE]], { abstract: true });
    await page.goto('/');
    expect(await firstRatio(page)).toBeCloseTo(LANDSCAPE.w / LANDSCAPE.h, 1);
    const url = requests.find((r) => /p00\.jpg/.test(r));
    // page.evaluate fetch goes through the route (page.request would not)
    const size = await page.evaluate(async (u) => {
      const res = await fetch(u);
      return res.ok ? (await res.arrayBuffer()).byteLength : -1;
    }, url);
    expect(size).toBeGreaterThan(5 * 1024);   // solid colours are < 1 KB
  });

  test('serves a 3-photo mixed album', async ({ page }) => {
    await mockAlbums(page, [[LANDSCAPE, PORTRAIT, PANORAMA]], { thumbnails: false });
    await page.goto('/');
    const ratios = [LANDSCAPE, PORTRAIT, PANORAMA].map((s) => s.w / s.h);
    const r = await firstRatio(page);
    expect(ratios.some((x) => Math.abs(x - r) < 0.05)).toBe(true);
  });
});
