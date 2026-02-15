/**
 * Smoke test suite for deployment verification
 *
 * Quick health checks that verify the server is running and serving
 * critical resources correctly. Target: < 10 seconds total.
 *
 * Run with: npm run test:smoke
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test.describe('Server Health', () => {
    test('GET / responds with HTML within 2s', async ({ page }) => {
      const startTime = Date.now();
      const response = await page.request.get('/');
      const elapsed = Date.now() - startTime;

      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('text/html');
      // 2s threshold accommodates slow hardware (Raspberry Pi) and CI overhead
      expect(elapsed).toBeLessThan(2000);
    });

    test('GET / includes security headers', async ({ page }) => {
      const response = await page.request.get('/');

      expect(response.headers()['x-content-type-options']).toBe('nosniff');
      expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
    });

    test('rejects non-GET methods with 405', async ({ page }) => {
      const response = await page.request.post('/', { data: '' });

      expect(response.status()).toBe(405);
    });
  });

  test.describe('Album API', () => {
    test('GET /album/1 returns valid JSON', async ({ page }) => {
      const response = await page.request.get('/album/1');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('images');
      expect(data).toHaveProperty('count');
      expect(Array.isArray(data.images)).toBe(true);
      expect(data.images.length).toBeGreaterThan(0);
      expect(data.count).toBe(data.images.length);

      // Each image has required 'file' property
      for (const image of data.images) {
        expect(image).toHaveProperty('file');
        expect(typeof image.file).toBe('string');
        expect(image.file.length).toBeGreaterThan(0);
      }
    });

    test('GET /album/0 returns empty album', async ({ page }) => {
      const response = await page.request.get('/album/0');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.images).toEqual([]);
      expect(data.count).toBe(0);
    });
  });

  test.describe('Photo Serving', () => {
    test('at least one photo can be served', async ({ page }) => {
      // Get a photo path from the album API
      const albumResponse = await page.request.get('/album/1');
      const data = await albumResponse.json();
      expect(data.images.length).toBeGreaterThan(0);

      const photoPath = data.images[0].file;
      const photoResponse = await page.request.get(photoPath);
      expect(photoResponse.ok()).toBe(true);
      expect(photoResponse.headers()['content-type']).toContain('image/');
    });
  });

  test.describe('Static Assets', () => {
    // SYNC: These lists must match www/index.html <link>/<script> tags
    test('all critical CSS files load', async ({ page }) => {
      const cssFiles = [
        '/node_modules/purecss/build/pure-min.css',
        '/css/main.css',
      ];

      for (const file of cssFiles) {
        const response = await page.request.get(file);
        expect(response.ok(), `CSS file failed to load: ${file}`).toBe(true);
      }
    });

    test('all critical JS files load', async ({ page }) => {
      const jsFiles = [
        '/node_modules/underscore/underscore-umd-min.js',
        '/node_modules/jquery/dist/jquery.min.js',
        '/node_modules/jquery-ui-dist/jquery-ui.min.js',
        '/node_modules/blueimp-load-image/js/load-image.all.min.js',
        '/js/config.mjs',
        '/js/utils.mjs',
        '/js/photo-store.mjs',
        '/js/prefetch.mjs',
        '/js/main.js',
      ];

      for (const file of jsFiles) {
        const response = await page.request.get(file);
        expect(response.ok(), `JS file failed to load: ${file}`).toBe(true);
      }
    });

    test('page loads without JavaScript errors', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      expect(errors).toEqual([]);
    });
  });

  test.describe('DOM Structure', () => {
    test('critical DOM elements exist', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('#content')).toBeVisible();
      await expect(page.locator('#top_row')).toBeVisible();
      await expect(page.locator('#bottom_row')).toBeVisible();
      await expect(page.locator('#photo_store')).toBeAttached();
      await expect(page.locator('#landscape')).toBeAttached();
      await expect(page.locator('#portrait')).toBeAttached();
      await expect(page.locator('#panorama')).toBeAttached();
    });
  });
});
