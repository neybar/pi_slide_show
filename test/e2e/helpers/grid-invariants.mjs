/**
 * E2E grid invariants: checks that both rows of a grid-mode page are completely
 * filled with loaded photos (no blank cells). Shared by the blank-cell guard and
 * other grid scenario tests.
 */
import { expect } from '@playwright/test';

/**
 * Wait until both rows have .photo children and the fade-in has finished
 * (every .photo is visible).
 * @param {import('@playwright/test').Page} page
 * @param {{timeout?: number}} [opts]
 */
export async function waitForRowsSettled(page, { timeout = 30000 } = {}) {
  await page.waitForFunction(() => {
    const rows = ['#top_row', '#bottom_row'].map((s) => document.querySelector(s));
    return rows.every((row) => {
      if (!row) return false;
      const photos = row.querySelectorAll('.photo');
      return photos.length > 0 && Array.from(photos).every((p) => {
        const cs = getComputedStyle(p);
        return cs.opacity === '1' && cs.display !== 'none';
      });
    });
  }, null, { timeout });
}

/**
 * Collect per-row facts from the page.
 * @param {import('@playwright/test').Page} page
 */
export async function readRows(page) {
  return page.evaluate(() => {
    const columnCount = window.innerWidth / window.innerHeight > 1.4 ? 5 : 4;
    const rows = {};
    for (const id of ['top_row', 'bottom_row']) {
      const photos = Array.from(document.querySelectorAll('#' + id + ' .photo'));
      rows[id] = {
        photoCount: photos.length,
        columnSum: photos.reduce((s, p) => s + (window.jQuery(p).data('columns') || 0), 0),
        imgBoxCount: document.querySelectorAll('#' + id + ' .img_box').length,
        unloaded: photos.filter((p) => {
          const imgs = Array.from(p.querySelectorAll('img'));
          return !imgs.some((i) => i.getAttribute('src') && i.complete && i.naturalWidth > 0);
        }).length,
      };
    }
    return { columnCount, rows };
  });
}

/**
 * Assert each row's photo columns sum to the grid width and every .photo holds a
 * loaded img.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Awaited<ReturnType<typeof readRows>>>} the facts read, for extra assertions
 */
export async function assertRowsFilled(page) {
  const facts = await readRows(page);
  for (const [id, row] of Object.entries(facts.rows)) {
    expect(row.photoCount, `#${id} has photos`).toBeGreaterThan(0);
    expect(row.columnSum, `#${id} columns sum to grid width`).toBe(facts.columnCount);
    expect(row.unloaded, `#${id} photos without a loaded img`).toBe(0);
  }
  return facts;
}
