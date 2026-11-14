/**
 * E2E tests for the single-photo display mode (1-photo albums): contain fit
 * over a blurred backdrop, no idle animation, short play time.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { overrideConfig } from './helpers/config-override.mjs';
import { mockAlbums, LANDSCAPE, PORTRAIT, PANORAMA, SQUARE } from './helpers/mock-album.mjs';

test.use({ viewport: { width: 1920, height: 1080 } });

async function openSingle(page, size) {
  // Collect CSP violations (e.g. a data: URL backdrop blocked by img-src 'self').
  // blueimp-load-image feature-detects EXIF support with a data: JPEG that the CSP also
  // blocks (harmless: it falls back to its own detection), so data: loads it starts are
  // expected and each cancels one data: violation.
  await page.addInitScript(() => {
    window.__cspViolations = [];
    let expectedDataBlocks = 0;
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...desc,
      set(v) {
        if (String(v).startsWith('data:') && /load-image/.test(new Error().stack || '')) expectedDataBlocks++;
        desc.set.call(this, v);
      },
    });
    document.addEventListener('securitypolicyviolation', (e) => {
      if (e.blockedURI === 'data' && expectedDataBlocks > 0) { expectedDataBlocks--; return; }
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`.slice(0, 120));
    });
  });
  await mockAlbums(page, [[size]]);
  await page.goto('/');
  await page.waitForFunction(() => {
    const img = document.querySelector('#hero_stage .hero_layer img');
    const box = document.querySelector('#hero_stage .hero_layer .img_box');
    return img && img.complete && img.naturalWidth > 0 && box && getComputedStyle(box).opacity === '1';
  }, { timeout: 15000 });
}

// Displayed content rect of the hero img (object-fit: contain)
const containRect = (page) => page.evaluate(() => {
  const img = document.querySelector('#hero_stage .hero_layer img');
  const r = img.getBoundingClientRect();
  const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  return {
    left: r.left + (r.width - w) / 2, right: r.left + (r.width + w) / 2,
    top: r.top + (r.height - h) / 2, bottom: r.top + (r.height + h) / 2,
    vw: window.innerWidth, vh: window.innerHeight,
  };
});

test.describe('Single-photo mode', () => {
  test('mode class set and shelf hidden', async ({ page }) => {
    await openSingle(page, LANDSCAPE);
    await expect(page.locator('body')).toHaveClass(/mode-single/);
    await expect(page.locator('.shelf:visible')).toHaveCount(0);
    await expect(page.locator('.album_name')).toBeVisible();
  });

  for (const [name, size, axis] of [
    ['landscape', LANDSCAPE, 'y'], ['portrait', PORTRAIT, 'y'], ['panorama', PANORAMA, 'x'],
  ]) {
    test(`${name} fills its binding axis`, async ({ page }) => {
      await openSingle(page, size);
      const r = await containRect(page);
      if (axis === 'x') {
        expect(Math.abs(r.left)).toBeLessThanOrEqual(2);
        expect(Math.abs(r.right - r.vw)).toBeLessThanOrEqual(2);
        expect(r.bottom - r.top).toBeLessThanOrEqual(r.vh + 2);
      } else {
        expect(Math.abs(r.top)).toBeLessThanOrEqual(2);
        expect(Math.abs(r.bottom - r.vh)).toBeLessThanOrEqual(2);
        expect(r.right - r.left).toBeLessThanOrEqual(r.vw + 2);
      }
    });
  }

  test('blurred backdrop covers the viewport behind the photo', async ({ page }) => {
    await openSingle(page, PORTRAIT);
    const info = await page.evaluate(() => {
      const layers = [...document.querySelectorAll('.hero_backdrop .backdrop_layer')];
      const visible = layers.find((l) => getComputedStyle(l).opacity === '1');
      const rect = visible.getBoundingClientRect();
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return {
        hasCanvas: !!visible.querySelector('canvas'),
        covers: rect.left <= 0 && rect.top <= 0 &&
          rect.right >= window.innerWidth && rect.bottom >= window.innerHeight,
        hitHero: hit && hit.matches('#hero_stage .hero_layer img'),
      };
    });
    expect(info.hasCanvas).toBe(true);
    expect(info.covers).toBe(true);
    expect(info.hitHero).toBe(true);
    expect(await page.evaluate(() => window.__cspViolations), 'CSP violations').toEqual([]);

    // Letterbox margin of a portrait photo shows the backdrop, not pure black
    const shot = await page.screenshot({ clip: { x: 20, y: 540, width: 4, height: 4 } });
    // Decode on a blank page: the app's CSP forbids data: images
    const blank = await page.context().newPage();
    const px = await blank.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(1, 1, 1, 1).data];
    }, shot.toString('base64'));
    await blank.close();
    expect(px[0] + px[1] + px[2], `letterbox pixel ${px}`).toBeGreaterThan(12);

    // Still covered after a resize
    await page.setViewportSize({ width: 1000, height: 1000 });
    const covers = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.hero_backdrop .backdrop_layer')]
        .find((x) => getComputedStyle(x).opacity === '1').getBoundingClientRect();
      return l.left <= 0 && l.top <= 0 && l.right >= innerWidth && l.bottom >= innerHeight;
    });
    expect(covers).toBe(true);
  });

  test('no slideshow rAF callbacks while idle', async ({ page }) => {
    await page.addInitScript(() => {
      window.__raf = [];
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        window.__raf.push(new Error().stack || '');
        return orig(cb);
      };
    });
    await openSingle(page, LANDSCAPE);
    await page.evaluate(() => { window.__raf.length = 0; });
    await page.waitForTimeout(3000);
    const own = await page.evaluate(() =>
      window.__raf.filter((s) => /\/js\/(main|backdrop|album-mode|filmstrip)/.test(s)).length);
    expect(own).toBe(0);
  });

  test('album ends after SINGLE_PHOTO_DURATION_MS', async ({ page }) => {
    await overrideConfig(page, { SINGLE_PHOTO_DURATION_MS: 4000, MIN_PHOTOS_FOR_TRANSITION: 1 });
    await mockAlbums(page, [[LANDSCAPE], [PORTRAIT]]);
    await page.goto('/');
    await expect(page.locator('.album_name')).toHaveText('2024 Mock Album 0');
    const navigated = page.waitForEvent('framenavigated', { timeout: 20000 }).catch(() => null);
    const t0 = Date.now();
    await Promise.race([
      page.waitForFunction(
        () => document.querySelector('.album_name').textContent !== '2024 Mock Album 0',
        null, { timeout: 20000 }).catch(() => null),
      navigated.then(() => null),
    ]);
    // Either the name changed (transition) or the page reloaded; either way, not early or very late
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThan(2500);
    expect(elapsed).toBeLessThan(15000);
  });

  test('passes axe checks', async ({ page }) => {
    await openSingle(page, LANDSCAPE);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['landmark-one-main', 'region', 'page-has-heading-one', 'meta-refresh'])
      .analyze();
    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
  });
});

// --- Seamless transitions between display modes (pi_slide_show-249.8) ---

// Short play times; MIN_PHOTOS_FOR_TRANSITION keeps its default (15), so the
// 12-photo grid album only transitions because minPhotosForMode caps it at 12.
const TRANSITION_FAST = {
  ALBUM_DURATION_MS: 6000,
  SINGLE_PHOTO_DURATION_MS: 4000,
  TINY_MIN_DURATION_MS: 4000,
  SWAP_INTERVAL: 1000,
  PREFETCH_LEAD_TIME: 3000,
};

const grid = (n) => Array.from({ length: n }, () => LANDSCAPE);
const SINGLE = [PORTRAIT];
const TINY_A = [LANDSCAPE, PORTRAIT, PANORAMA, PORTRAIT];
const TINY_B = [PORTRAIT, LANDSCAPE, LANDSCAPE, PORTRAIT];

const BODY_CLASS = { grid: 'mode-grid', single: 'mode-single', tiny: 'mode-tiny' };

/**
 * Every animation frame of every fade-in (from #content at opacity 0 back to 1),
 * record what is at the viewport center. The grid's row gutter runs through the
 * exact center, so also probe 30% and 70% down the center line (inside each row,
 * clear of a stacked pair's gutter at 25% and 75%). A frame where none of the
 * points hits a loaded img is blank.
 */
async function installFadeInSampler(page) {
  await page.evaluate(() => {
    const content = document.querySelector('#content');
    const f = { fadeIns: 0, samples: 0, blank: [], backdropNotReady: [], phase: 'idle' };
    window.__fade = f;
    const step = () => {
      const op = parseFloat(getComputedStyle(content).opacity);
      if (op < 0.01) {
        if (f.phase !== 'in') f.fadeIns++;
        f.phase = 'in';
      } else if (f.phase === 'in') {
        f.samples++;
        const hits = [0.5, 0.3, 0.7].map((y) => document.elementFromPoint(innerWidth / 2, innerHeight * y));
        const el = hits[0];
        const ok = hits.some((h) => h && h.tagName === 'IMG' && h.complete && h.naturalWidth > 0);
        if (!ok) {
          f.blank.push({
            op,
            el: el ? `${el.tagName}#${el.id}.${el.className}` : null,
            album: document.querySelector('.album_name').textContent,
          });
        }
        // Hero modes fade in only once their backdrop has finished fading in
        if (getComputedStyle(document.querySelector('#hero_stage')).display !== 'none') {
          const layers = [...document.querySelectorAll('.hero_backdrop .backdrop_layer')];
          const backdrop = Math.max(0, ...layers.map((l) => parseFloat(getComputedStyle(l).opacity)));
          if (backdrop < 0.99) {
            f.backdropNotReady.push({ op, backdrop, album: document.querySelector('.album_name').textContent });
          }
        }
        if (op >= 0.999) f.phase = 'idle';
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// What is on screen once an album has faded in
const screenState = (page) => page.evaluate(() => {
  const srcs = (sel) => [...document.querySelectorAll(sel)].map((i) => decodeURIComponent(i.src));
  const visibleLayer = [...document.querySelectorAll('.hero_backdrop .backdrop_layer')]
    .find((l) => getComputedStyle(l).opacity === '1');
  return {
    modeClasses: document.body.className.split(/\s+/).filter((c) => c.startsWith('mode-')),
    name: document.querySelector('.album_name').textContent,
    contentImgs: srcs('#content img'),
    heroBoxes: document.querySelectorAll('#hero_stage .hero_layer .img_box').length,
    tinyHeroes: document.querySelectorAll('#hero_stage .hero_layer .img_box.is-hero').length,
    tinyCells: document.querySelectorAll('#hero_stage .hero_layer .img_box.filmstrip_cell').length,
    shelfPhotos: document.querySelectorAll('#top_row .photo, #bottom_row .photo').length,
    shelfVisible: [...document.querySelectorAll('.shelf')].some((s) => s.offsetParent !== null),
    heroVisible: getComputedStyle(document.querySelector('#hero_stage')).display !== 'none',
    backdrop: visibleLayer && visibleLayer.querySelector('canvas')
      ? visibleLayer.querySelector('canvas').toDataURL() : null,
  };
});

// Resolves once album idx has faded in, or as soon as `reloaded` resolves, so the
// caller's reload check fails with a clear message instead of a timeout
async function waitForAlbumShown(page, idx, reloaded) {
  const shown = page.waitForFunction(
    (name) => document.querySelector('.album_name').textContent === name &&
      document.querySelector('#content img') !== null &&
      parseFloat(getComputedStyle(document.querySelector('#content')).opacity) >= 0.999,
    `2024 Mock Album ${idx}`,
    { timeout: 25000 },
  );
  await (reloaded ? Promise.race([shown, reloaded]) : shown);
}

/**
 * Serve `chain` (an array of [mode, sizes]) as consecutive albums and check every
 * transition: no reload, the right mode on screen, the new name, only the new
 * album's photos, and no blank frame during any fade-in.
 */
async function runChain(page, chain) {
  await overrideConfig(page, TRANSITION_FAST);
  await mockAlbums(page, chain.map(([, sizes]) => sizes));
  let loads = 0;
  const reloaded = new Promise((resolve) => {
    page.on('load', () => { if (++loads > 1) resolve(); });
  });
  await page.goto('/');
  await waitForAlbumShown(page, 0);
  await page.evaluate(() => { window.__noReload = true; });
  await installFadeInSampler(page);

  let prev = null;
  for (let i = 0; i < chain.length; i++) {
    const [mode] = chain[i];
    if (i > 0) await waitForAlbumShown(page, i, reloaded);
    const s = await screenState(page);
    const label = `album ${i} (${chain[i - 1]?.[0] ?? 'load'} -> ${mode})`;

    expect(await page.evaluate(() => window.__noReload === true), `${label}: reloaded`).toBe(true);
    expect(s.modeClasses, label).toEqual([BODY_CLASS[mode]]);
    expect(s.name, label).toBe(`2024 Mock Album ${i}`);
    expect(s.contentImgs.length, `${label}: nothing rendered`).toBeGreaterThan(0);
    for (const src of s.contentImgs) {
      expect(src, `${label}: leftover photo`).toContain(`/Mock Album ${i}/`);
    }

    if (mode === 'single') {
      expect(s.heroBoxes, label).toBe(1);
      expect(s.shelfPhotos, label).toBe(0);
      expect(s.shelfVisible, label).toBe(false);
      expect(s.heroVisible, label).toBe(true);
      expect(s.backdrop, `${label}: backdrop canvas`).toMatch(/^data:image/);
      if (prev && prev.mode === 'single') {
        expect(s.backdrop, `${label}: backdrop not changed`).not.toBe(prev.backdrop);
      }
    } else if (mode === 'tiny') {
      // One hero plus the rest as strip cells; nothing left from the previous album
      expect(s.tinyHeroes, label).toBe(1);
      expect(s.tinyCells, label).toBe(chain[i][1].length - 1);
      expect(s.heroBoxes, label).toBe(chain[i][1].length);
      expect(s.shelfPhotos, label).toBe(0);
      expect(s.shelfVisible, label).toBe(false);
      expect(s.heroVisible, label).toBe(true);
      expect(s.backdrop, `${label}: backdrop canvas`).toMatch(/^data:image/);
    } else {
      expect(s.heroBoxes, label).toBe(0);
      expect(s.shelfPhotos, label).toBeGreaterThan(0);
      expect(s.shelfVisible, label).toBe(true);
      expect(s.heroVisible, label).toBe(false);
    }
    prev = { mode, backdrop: s.backdrop };
  }

  const fade = await page.evaluate(() => window.__fade);
  expect(fade.fadeIns).toBeGreaterThanOrEqual(chain.length - 1);
  expect(fade.samples).toBeGreaterThan(0);
  expect(fade.blank, 'frames with #content visible but nothing at the center').toEqual([]);
  expect(fade.backdropNotReady, 'hero fade-in started before its backdrop was ready').toEqual([]);
  expect(loads).toBe(1);
}

test.describe('Transitions between display modes', () => {
  test('grid -> single -> single -> tiny -> tiny -> 12-photo grid, no reload', async ({ page }) => {
    test.setTimeout(120000);
    await runChain(page, [
      ['grid', grid(35)],
      ['single', SINGLE],
      ['single', [LANDSCAPE]],
      ['tiny', TINY_A],
      ['tiny', TINY_B],
      ['grid', grid(12)],
    ]);
  });

  test('grid -> tiny -> single -> grid, no reload', async ({ page }) => {
    test.setTimeout(90000);
    await runChain(page, [
      ['grid', grid(35)],
      ['tiny', TINY_A],
      ['single', SINGLE],
      ['grid', grid(20)],
    ]);
  });
});

// --- Tiny layout (pi_slide_show-249.6.2) ---

const MIXED4 = [LANDSCAPE, PORTRAIT, PANORAMA, SQUARE];
const THREE_PORTRAITS = [PORTRAIT, PORTRAIT, PORTRAIT];
const MIXED10 = [LANDSCAPE, PORTRAIT, PANORAMA, SQUARE, LANDSCAPE, PORTRAIT, SQUARE, PANORAMA, LANDSCAPE, PORTRAIT];

async function openTiny(page, sizes, viewport) {
  await page.setViewportSize(viewport);
  await mockAlbums(page, [sizes]);
  await page.goto('/');
  await page.waitForFunction((n) => {
    const boxes = [...document.querySelectorAll('#hero_stage .hero_layer .img_box')];
    return boxes.length === n && boxes.every((b) => {
      const img = b.querySelector('img');
      return img && img.complete && img.naturalWidth > 0 && getComputedStyle(b).opacity === '1';
    });
  }, sizes.length, { timeout: 20000 });
}

async function tinyGeometry(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const boxes = [...document.querySelectorAll('#hero_stage .hero_layer .img_box')];
    const hero = document.querySelector('#hero_stage .is-hero');
    const hi = hero.querySelector('img');
    return {
      vw: innerWidth, vh: innerHeight,
      bodyClass: document.body.className,
      heroes: document.querySelectorAll('#hero_stage .is-hero').length,
      cells: document.querySelectorAll('#hero_stage .filmstrip_cell').length,
      heroAspect: hi.naturalWidth / hi.naturalHeight,
      boxes: boxes.map((b) => ({ ...rect(b), hero: b.classList.contains('is-hero') })),
      name: rect(document.querySelector('.album_name')),
    };
  });
}

const overlaps = (a, b) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

function checkInvariants(g, n, label) {
  expect(g.bodyClass, label).toMatch(/mode-tiny/);
  expect(g.heroes, label).toBe(1);
  expect(g.cells, label).toBe(n - 1);
  expect(g.boxes.length, label).toBe(n);
  for (let i = 0; i < g.boxes.length; i++) {
    const b = g.boxes[i];
    expect(b.left, `${label}: box ${i} left`).toBeGreaterThanOrEqual(-0.5);
    expect(b.top, `${label}: box ${i} top`).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, `${label}: box ${i} right`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.bottom, `${label}: box ${i} bottom`).toBeLessThanOrEqual(g.vh + 0.5);
    expect(b.right - b.left, `${label}: box ${i} width`).toBeGreaterThan(0);
    for (let j = i + 1; j < g.boxes.length; j++) {
      expect(overlaps(b, g.boxes[j]), `${label}: boxes ${i} and ${j} overlap`).toBe(false);
    }
    if (!b.hero) {
      expect(overlaps(b, g.name), `${label}: album name overlaps cell ${i}`).toBe(false);
    }
  }
  const hero = g.boxes.find((b) => b.hero);
  const cell = g.boxes.find((b) => !b.hero);
  if (cell) {
    // Strip on the right of a portrait hero, else below
    if (g.heroAspect < 1) expect(cell.left, `${label}: strip right`).toBeGreaterThanOrEqual(hero.right - 0.5);
    else expect(cell.top, `${label}: strip below`).toBeGreaterThanOrEqual(hero.bottom - 0.5);
    expect(g.bodyClass, label).toContain(g.heroAspect < 1 ? 'tiny-strip-right' : 'tiny-strip-below');
  }
}

test.describe('Tiny layout', () => {
  const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }];
  const ALBUMS = [['4 mixed', MIXED4], ['3 portraits', THREE_PORTRAITS], ['10 mixed', MIXED10]];

  for (const [name, sizes] of ALBUMS) {
    for (const vp of VIEWPORTS) {
      test(`${name} at ${vp.width}x${vp.height}, then resized`, async ({ page }) => {
        await openTiny(page, sizes, vp);
        const n = sizes.length;
        const g = await tinyGeometry(page);
        checkInvariants(g, n, `${name} ${vp.width}`);
        if (name === '3 portraits') {
          expect(g.heroAspect).toBeLessThan(1);
          expect(g.bodyClass).toContain('tiny-strip-right');
        }
        const other = VIEWPORTS.find((v) => v !== vp);
        await page.setViewportSize(other);
        await page.waitForFunction((w) => innerWidth === w, other.width);
        await page.waitForTimeout(200);
        checkInvariants(await tinyGeometry(page), n, `${name} resized to ${other.width}`);
      });
    }
  }
});
