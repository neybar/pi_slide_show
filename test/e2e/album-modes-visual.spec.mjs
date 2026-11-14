/**
 * E2E and visual verification of the display modes over the generated scenario
 * albums (pi_slide_show-249.9). The albums come from the real server through the
 * test-only /album/scenario/:name route, so EXIF Orientation, Synology @eaDir
 * thumbnails and discovery are real (the mock-album tests can't cover those).
 *
 * Per-feature tests live in album-modes.spec.mjs (mock albums) and
 * scenarios-grid.spec.mjs; this file checks the finished feature on realistic
 * photos at 1920x1080 and 1024x768 and writes one screenshot per scenario and
 * viewport to test-screenshots/album-modes-visual/ for a human to look at (not
 * committed, not pixel-diffed). That directory is outside test-results/ because
 * Playwright empties test-results/ at the start of every run.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { useScenario } from './helpers/scenario.mjs';
import { overrideConfig } from './helpers/config-override.mjs';
import { waitForRowsSettled } from './helpers/grid-invariants.mjs';

const SHOT_DIR = 'test-screenshots/album-modes-visual';
const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }];

// The scenario route is test-only; skip when the target server lacks it.
test.beforeAll(async ({ request }) => {
  const res = await request.get('/album/scenario/single-landscape');
  test.skip(res.status() === 404, 'Scenario route/fixtures not available on this server');
});

// No rotation (or album transition) while a test measures or takes a screenshot
const STILL = { SWAP_INTERVAL: 10 * 60 * 1000, TINY_HERO_INTERVAL_MS: 10 * 60 * 1000 };

// Settle time after everything is loaded: entrance animation (800 ms) plus margin
const SETTLE_MS = 1200;

async function openHero(page, name, vp, n, config = STILL) {
  await page.setViewportSize(vp);
  await overrideConfig(page, config);
  await useScenario(page, name);
  await page.goto('/');
  await page.waitForFunction((count) => {
    const boxes = [...document.querySelectorAll('#hero_stage .hero_layer .img_box')];
    const backdrop = [...document.querySelectorAll('.hero_backdrop .backdrop_layer')]
      .some((l) => getComputedStyle(l).opacity === '1' && l.querySelector('canvas'));
    return backdrop && boxes.length === count && boxes.every((b) => {
      const img = b.querySelector('img');
      return img && img.complete && img.naturalWidth > 0 && getComputedStyle(b).opacity === '1';
    }) && parseFloat(getComputedStyle(document.querySelector('#content')).opacity) >= 0.999;
  }, n, { timeout: 20000 });
  await page.waitForTimeout(SETTLE_MS);
}

async function openGrid(page, name, vp) {
  await page.setViewportSize(vp);
  await overrideConfig(page, STILL);
  await useScenario(page, name);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/(^|\s)mode-grid(\s|$)/, { timeout: 15000 });
  await waitForRowsSettled(page);
  await page.waitForTimeout(SETTLE_MS);
}

async function shot(page, name, vp) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}-${vp.width}x${vp.height}.png` });
}

// Displayed content rect of the hero img: getBoundingClientRect is the box, and
// object-fit: contain doesn't change it, so derive the content rect from the
// natural size (already the EXIF-rotated size in Chrome).
const heroFacts = (page) => page.evaluate(() => {
  const img = document.querySelector('#hero_stage .hero_layer img');
  const r = img.getBoundingClientRect();
  const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  const backdrop = [...document.querySelectorAll('.hero_backdrop .backdrop_layer')]
    .find((l) => getComputedStyle(l).opacity === '1');
  const bd = backdrop.getBoundingClientRect();
  // The hero img is on top at the viewport center (a panning panorama overhangs the viewport)
  const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return {
    vw: innerWidth, vh: innerHeight,
    natural: { w: img.naturalWidth, h: img.naturalHeight },
    box: { w: r.width, h: r.height },
    left: r.left + (r.width - w) / 2, right: r.left + (r.width + w) / 2,
    top: r.top + (r.height - h) / 2, bottom: r.top + (r.height + h) / 2,
    backdropCovers: bd.left <= 0 && bd.top <= 0 && bd.right >= innerWidth && bd.bottom >= innerHeight,
    heroOnTop: hit === img,
    panning: document.querySelectorAll('#hero_stage .hero_layer .hero-pan-run').length,
  };
});

const expectAxis = (r, axis, label) => {
  if (axis === 'x') {
    expect(Math.abs(r.left), `${label} left`).toBeLessThanOrEqual(2);
    expect(Math.abs(r.right - r.vw), `${label} right`).toBeLessThanOrEqual(2);
    expect(r.bottom - r.top, `${label} height`).toBeLessThanOrEqual(r.vh + 2);
  } else {
    expect(Math.abs(r.top), `${label} top`).toBeLessThanOrEqual(2);
    expect(Math.abs(r.bottom - r.vh), `${label} bottom`).toBeLessThanOrEqual(2);
    expect(r.right - r.left, `${label} width`).toBeLessThanOrEqual(r.vw + 2);
  }
};

test.describe('Single-photo scenarios', () => {
  // [scenario, shape of the displayed photo]
  const SINGLES = [
    ['single-landscape', 'landscape'],
    ['single-portrait', 'portrait'],
    ['single-exif6', 'portrait'],
    ['single-panorama', 'panorama'],
  ];

  for (const vp of VIEWPORTS) {
    for (const [name, shape] of SINGLES) {
      test(`${name} at ${vp.width}x${vp.height}`, async ({ page }) => {
        await openHero(page, name, vp, 1);
        await expect(page.locator('body')).toHaveClass(/(^|\s)mode-single(\s|$)/);
        const r = await heroFacts(page);
        const label = `${name} ${vp.width}`;

        expect(r.backdropCovers, `${label}: backdrop covers viewport`).toBe(true);
        expect(r.heroOnTop, `${label}: hero above the backdrop`).toBe(true);

        if (shape === 'panorama') {
          // Wider than the screen: height-bound, wider than the viewport, and it pans
          // (not contain-fit; the pan was added after this issue was written)
          expect(r.natural.w / r.natural.h).toBeGreaterThan(r.vw / r.vh);
          expect(Math.abs(r.box.h - r.vh), `${label} height-bound`).toBeLessThanOrEqual(2);
          expect(r.box.w, `${label} wider than viewport`).toBeGreaterThan(r.vw);
          expect(r.panning, `${label} pan running`).toBe(1);
        } else {
          if (name === 'single-exif6') {
            // Stored landscape, Orientation 6: fits by its displayed (rotated) shape
            expect(r.natural.h, `${label} rotated to portrait`).toBeGreaterThan(r.natural.w);
          }
          const photoAspect = r.natural.w / r.natural.h;
          expect(photoAspect > 1, label).toBe(shape === 'landscape');
          // The binding axis is the one where the photo is relatively larger
          expectAxis(r, photoAspect > r.vw / r.vh ? 'x' : 'y', label);
        }
        await shot(page, name, vp);
      });
    }
  }
});

const overlaps = (a, b) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

const tinyGeometry = (page) => page.evaluate(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  return {
    vw: innerWidth, vh: innerHeight,
    boxes: [...document.querySelectorAll('#hero_stage .hero_layer .img_box')].map((b) => rect(b)),
    heroes: document.querySelectorAll('#hero_stage .is-hero').length,
  };
});

test.describe('Tiny scenarios', () => {
  const TINIES = [['tiny-4-mixed', 4], ['tiny-6-portrait', 6], ['boundary-10', 10]];

  for (const vp of VIEWPORTS) {
    for (const [name, n] of TINIES) {
      test(`${name} at ${vp.width}x${vp.height}`, async ({ page }) => {
        await openHero(page, name, vp, n);
        await expect(page.locator('body')).toHaveClass(/(^|\s)mode-tiny(\s|$)/);
        const g = await tinyGeometry(page);
        expect(g.heroes).toBe(1);
        for (let i = 0; i < g.boxes.length; i++) {
          const b = g.boxes[i];
          expect(b.left, `box ${i} left`).toBeGreaterThanOrEqual(-0.5);
          expect(b.top, `box ${i} top`).toBeGreaterThanOrEqual(-0.5);
          expect(b.right, `box ${i} right`).toBeLessThanOrEqual(g.vw + 0.5);
          expect(b.bottom, `box ${i} bottom`).toBeLessThanOrEqual(g.vh + 0.5);
          for (let j = i + 1; j < g.boxes.length; j++) {
            expect(overlaps(b, g.boxes[j]), `boxes ${i} and ${j} overlap`).toBe(false);
          }
        }
        await shot(page, name, vp);
      });
    }
  }

  test('tiny-4-mixed loads the Synology thumbnails for the strip', async ({ page }) => {
    const thumbs = [];
    page.on('request', (req) => { if (/@eaDir/.test(decodeURIComponent(req.url()))) thumbs.push(req.url()); });
    await openHero(page, 'tiny-4-mixed', VIEWPORTS[0], 4);
    expect(thumbs.length, '@eaDir thumbnail requests').toBeGreaterThan(0);
  });

  // The 249.7 lap check, over the real mostly-portrait album
  test('tiny-6-portrait: round-robin lap, strip moves, no bare-backdrop frame', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const SWAP = 2500; // long enough for a relocating rotation (250 + 800 + 800 ms)
    await openHero(page, 'tiny-6-portrait', VIEWPORTS[0], 6, { TINY_HERO_INTERVAL_MS: SWAP });
    await page.evaluate(() => {
      const r = { heroes: [], sides: new Set(), bare: [], noHero: 0 };
      window.__rot = r;
      const step = () => {
        const hero = document.querySelector('#hero_stage .hero_layer .img_box.is-hero');
        if (!hero) {
          r.noHero++;
        } else {
          const src = decodeURIComponent(hero.querySelector('img').src);
          if (r.heroes[r.heroes.length - 1] !== src) r.heroes.push(src);
          const s = hero.style;
          const hit = document.elementFromPoint(
            parseFloat(s.left) + parseFloat(s.width) / 2, parseFloat(s.top) + parseFloat(s.height) / 2);
          if (!hit || !hit.matches('#hero_stage .hero_layer .img_box img')) {
            r.bare.push(hit ? `${hit.tagName}.${hit.className}` : null);
          }
        }
        const cls = document.body.className;
        if (cls.includes('tiny-strip-right')) r.sides.add('right');
        if (cls.includes('tiny-strip-below')) r.sides.add('below');
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const n = 6;
    await page.waitForFunction((count) => window.__rot.heroes.length >= count, n + 1, { timeout: 60000 });
    const r = await page.evaluate(() => ({ ...window.__rot, sides: [...window.__rot.sides] }));
    const lap = r.heroes.slice(0, n);
    expect(new Set(lap).size, `heroes ${lap}`).toBe(n);
    for (const src of lap) expect(src).toContain('/scenarios/tiny-6-portrait/');
    expect(r.heroes[n], 'lap wraps to the first hero').toBe(lap[0]);
    // Mostly portrait with one landscape: strip right of portrait heroes, below the landscape one
    expect(r.sides.sort()).toEqual(['below', 'right']);
    expect(r.noHero, 'frames without a hero').toBe(0);
    expect(r.bare, 'frames with the bare backdrop at the hero center').toEqual([]);
    expect(errors).toEqual([]);
  });
});

// Grid layout is covered in scenarios-grid.spec.mjs; these add the by-eye
// screenshots (partial-12 is above TINY_ALBUM_MAX, so it stays a grid)
test.describe('Grid scenario screenshots', () => {
  for (const vp of VIEWPORTS) {
    for (const name of ['partial-12', 'full-no-panorama', 'full-panorama']) {
      test(`${name} at ${vp.width}x${vp.height}`, async ({ page }) => {
        await openGrid(page, name, vp);
        await shot(page, name, vp);
      });
    }
  }
});
